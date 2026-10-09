# Plan: each coder in its own working copy and database

> **Version**: 1.1 draft | **Date**: 2026-10-09 | **Status**: 1.0 APPROVED by Genesis Perez, 2026-10-09 (L147). 1.1 DRAFT answers the S8 review's findings on this plan (I-5, I-6, nits 9 and 10), awaiting approval (L147 ruling 5) | **Decision rows**: L140 (part 2 deferred until after S8), L146, L147 | **Spec**: none (tooling for Phase 1's rails, like `plan/PH1-verify-lock.md`) | **Approver**: Genesis Perez, product owner | **Builds**: api-coder (Sonnet 5.5), tests first | **Review**: dod-reviewer (AI self-check) | **Merge**: the product owner's go (L139)

## Why

Today every session and every coder works in one folder, `C:\Users\User\FlutterProjects\Gabay`, with one git index, one checked-out branch and one database, `gabay_dev`. Three problems follow, each seen already:

1. **Checks collide.** Two verify runs at once went red with no fault in the code (`S7.md` §6). The lock (L140, L143) now makes the second run wait instead, but the database is still shared.
2. **Branches and commits collide.** On 2026-10-09 another session's commit (`2613c43`) landed on this session's branch `phase-order-rulings`, because all sessions share the checked-out branch. The shared git index is also why CLAUDE.md asks for `git commit -- <paths>`.
3. **Half-finished edits trip the finish hooks.** A coder's unfinished edits sit in the main folder, so the main session's Stop hooks (L129, L130) can fire on them.

Phase 2 (L146) puts api-coder and flutter-coder to work at the same time, so this has to be fixed first.

## What

1. **One working copy per agent, kept between tasks.** Each one is a `git worktree` in a sibling folder, `C:\Users\User\FlutterProjects\Gabay-wt\<name>`, where `<name>` is the agent: `api-coder`, `flutter-coder`, `engine-coder`, `native-ble` or `test-verifier`. Each has its own branch, index and files. The main folder stays the main session's.
2. **Each working copy has its own database,** `gabay_wt_<name>` (for example `gabay_wt_api_coder`), on the same local PostgreSQL 18.6.
3. **One command sets a working copy up:** `npm run worktree:new -- <name> [<branch>]`. It:
   - fetches `origin`, then adds the worktree on a new branch. With no branch named, it uses `wt/<name>/<date>`, made from the fetched `origin/main` (1.1: fetch first, so the base is current).
   - writes the worktree's own `.env`, a copy of the main `.env` with only `PGDATABASE` changed. No value is printed.
   - creates the database if it is missing.
   - copies the internal seed source `db/seeds/sources/internal/` (the penthouse, the prototype floor, L43) from the main folder, if it is there (1.1, the S8 review's I-6). The folder stays git-ignored (`.gitignore:5`; L48, L123): it is copied file to file on this machine, never committed or pushed, and a copy without it seeds as a clean clone does (the penthouse skipped with a note, `db/seeds/seed.js:24`).
   - installs the packages: `npm ci` in `functions/`, `db/tools/` and `db/seeds/`, and `flutter pub get` in `app/`.
   - runs `npm run setup-db` and prints the result.

   A second command, `npm run worktree:remove -- <name>`, removes the worktree and drops its database. It refuses if the worktree has uncommitted changes, unless `--force` is given.
4. **The ports stay shared, under the existing lock.** Every verify run on the machine still waits its turn, as now. This is what L140 asked for ("sharing the ports under this lock"); see WT-2 for the alternative.
5. **The verify lock names the working copy.** The lock already records the folder, so the "verify is busy" line reads `held by api-coder (pid <n>, C:\Users\User\FlutterProjects\Gabay-wt\api-coder, <commit>)`, the form in `tools/lib/verify-lock.js:113–114`. No change to the lock's code is expected; a test proves that form (1.1: the pid and commit added, the S8 review's nit 9).
6. **How agents are pointed at it.** The main session gives each coder its folder in the task prompt ("work only in `…\Gabay-wt\api-coder`"), and the coder agent files get one line saying the same. When the work is done, the coder pushes its branch and the main session opens the pull request after your go, as now.
7. **The git hooks still run** in every working copy, because `core.hooksPath` is shared repository config.
8. **The Claude Code hooks follow the edited copy** (1.1, the S8 review's I-5). Today every hook in `.claude/settings.json` runs as `node "$CLAUDE_PROJECT_DIR"/.claude/hooks/…`, and `.claude/hooks/lib.js:13` fixes `ROOT` to the main folder. So the drift check after a Dart edit (`post-edit-drift.js:11–15`, run with `cwd: ROOT`) and the "verify ran after edits" Stop check (`stop-verify.js:39`, `:55`) look at the main folder, not the copy a coder edited. 1.1: each hook takes its root from the edited file's own repository (`git rev-parse --show-toplevel` in the file's folder) and falls back to `ROOT` when no file is named. Checked 2026-10-09 in the Claude Code docs (code.claude.com/docs/en/worktrees, "Hook paths don't follow the worktree"): "`${CLAUDE_PROJECT_DIR}` stays put: it still points at the project root where the session started", and "`cwd` follows Claude: the `cwd` field in the hook's input JSON is the worktree root, and it moves again when Claude runs `cd`". PostToolUse fires for a subagent's tool calls (code.claude.com/docs/en/sub-agents). So: the edit hooks use the edited file's path (`tool_input.file_path`); hooks with no file (Stop) use the input's `cwd`; both resolve to their repository's top level, and the scripts themselves still load from the main folder.

## DESIGN CHOICES (each with an alternative)

| # | Choice | Alternative, and why it was passed over |
|---|---|---|
| WT-1 | Named working copies kept between tasks, one per agent | Claude Code's `isolation: "worktree"`, which makes a new temporary worktree per task under `.claude/worktrees/` and removes it when unchanged. A `.worktreeinclude` file can copy git-ignored files such as `.env` into it (checked 2026-10-09, code.claude.com/docs/en/worktrees), but the copy keeps the main `PGDATABASE`, and there is no setup step for a git worktree short of replacing creation with a `WorktreeCreate` hook, so each task would still pay `npm ci`, `flutter pub get` and a database of its own. Better if tasks are rare and short. |
| WT-2 | Shared ports, one verify at a time (L140's wording) | Own ports per working copy, so verify runs go side by side. Checked this session in the installed firebase-tools 15.32.1 source: the CLI takes `-c, --config <path>` (`lib/index.js:16`), and the config schema has `hub` and `logging` port keys (`schema/firebase-config.json:1613, 1625`). So it is possible, but it needs generated configs, verify's fixed port lists (`tools/verify.js:107–109, 138`) made per copy, and the lock split per port set. Better once queued verify runs actually slow two coders down; it can be added later without undoing this plan. |
| WT-3 | Database name `gabay_wt_<name>` with hyphens turned into underscores | One `gabay_test` database shared by the coders: it brings back the collision this plan removes. |
| WT-4 | Sibling folder `Gabay-wt\` outside the repository | Inside the repository (for example `.worktrees\`): the linters, Prettier and Flutter would walk into the copies unless every tool ignores them. |
| WT-5 | `.env` copied with only `PGDATABASE` changed | A shared `.env` with a per-copy override: every reader (`node --env-file`, `process.loadEnvFile()`) would need changing. |

## Tests (tests first; each fails before its build)

- `worktree:new` with a fake git and a fake database:
  - creates the worktree, writes `.env` with only `PGDATABASE` changed, and creates the database once (a second run does not fail);
  - refuses an unknown agent name;
  - prints no `.env` value.
- `worktree:remove` refuses a worktree with uncommitted changes, and removes it with `--force`.
- The `.env` writer keeps every other line byte for byte.
- One live run on this machine, pasted in the report:
  - create `api-coder`;
  - run `npm run verify` there (ALL GREEN against `gabay_wt_api_coder`);
  - start a verify in the main folder at the same time and show it waiting with the "held by …\Gabay-wt\api-coder" line;
  - then remove the copy.

## Sync table

- **New commands** `worktree:new` and `worktree:remove`: CLAUDE.md Commands, README, INSTALL.md (a new section "Coder working copies"), and `tools/verify.js` (only if it gains a check; none is planned).
- **The coder agent files:** one line each, naming the working copy.
- **CLAUDE.md:** the Commands line "they share `gabay_dev`" becomes "each working copy has its own database; the emulator ports stay shared"; the `git commit -- <paths>` line stays (the main folder is still shared by the main sessions).
- **Comments that name `gabay_dev` as the only database** (`tools/verify.js:15`, `:38`; `tools/lib/verify-lock.js:2`; `functions/test/helpers.js:1`): reworded to "the copy's database (`PGDATABASE`)" (1.1, nit 10).
- **The Claude Code hooks** (point 8): `.claude/hooks/lib.js` and the hooks that use `ROOT`, with tests for an edit inside a copy.
- **No schema, route, screen or dependency change.**

## Open questions

1. Should `test-verifier` share the coder's working copy (it tests what the coder wrote) or have its own? Recommended: share the coder's copy, since it needs the coder's unpushed changes.
2. Disk: each copy holds its own `node_modules` and Flutter build folders (size unmeasured; measured in the live run).

## Not in this plan

Own ports per copy (WT-2). Any change to how the main sessions share the main folder.
