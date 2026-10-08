# Gabay — Working Agreement

> **Version**: 1.10 | **Date**: 2026-10-08 | **Status**: in force (plan.html L121; §8 added by L122; §2 and §7 amended by L123, L124, L125; §6 amended by L129, L130; §1 amended by L131; §2 and §7 amended by L135, L136; §1 amended by L139; §6 amended by L140) | **Audience**: Claude Code, every agent in `.claude/agents/`, and anyone working on Gabay | **Scope**: how work is decided, done, proven and recorded. What "done" means is `docs/product/FEATURE_PIPELINE.md` §5; the review passes are `REVIEW.md`; the engineering rules are the Dynamiq standard and `CLAUDE.md`.

The product owner set these rules so they never have to be repeated. When the product owner rules something new about *how we work*, it goes here (or in `CLAUDE.md` if it is an absolute rule) in the same turn, with its L-row.

## 1. Decisions: ask, never assume

- **Anything not settled by the spec, the plan, the PRD, the Blueprint or a decision-log row is asked, not assumed** (L121). This covers behaviour, data, wording, screens and scope.
- **Purely internal choices** (names, a helper's shape) inside an approved spec and plan are listed as **DESIGN CHOICES** in the plan or PR, each with an alternative, for the product owner to approve or overrule.
- **How to ask:** with AskUserQuestion, the recommended option first and marked, each option with its evidence and tradeoff. Research first and show what was found; tag anything unchecked **RECALLED**, and check it before it carries weight (CLAUDE.md evidence standard).
- **Where documents, references or rulings disagree,** stop and ask, quoting both.
- **Record every ruling** as a `plan.html` decision-log row (append-only, with a version bump and a changelog row), and update the PRD, Blueprint, pipeline, schema, CLAUDE.md, this file and, for a product ruling, the `gabay-product-rulings` skill (`.claude/skills/`; every product agent preloads it, L131) as the ruling touches them, in the same turn. No document is edited before the product owner's go-ahead.
- **Deploys and outward actions** (creating a repository, pushing, publishing a store build, deploying to Firebase) happen only on the product owner's call (L109).
- **Every action is asked first (L139):** before any action (editing a file, starting an agent, a branch, a push, a pull request, a merge, a GitHub setting, publishing a page) the main session asks the product owner with AskUserQuestion, the recommended option first; read-only checks to prepare the question are allowed. A go covers only the actions it names; every merge needs its own go.

## 2. Approvals (L121)

| Step | Artifact | Who approves |
|---|---|---|
| Intent and spec | `intent/<id>-<slug>.md`, `spec/<id>.md` (spec-writer) | The product owner approves both together: scope, and anything the spec flags (schema changes above all) |
| Plan | `plan/<id>.md` (names the spec revision, the §5 items it triggers, its DESIGN CHOICES) | The product owner |
| Code and tests | the diff (coders), the tests (test-verifier) | Nobody yet: the agent that wrote it can never approve it (standard §14.2) |
| Review | dod-reviewer: runs `npm run verify` in a fresh context, then `REVIEW.md` and §5 | An AI self-check, never a sign-off |
| PR | with the evidence of §5.3; lint and e2e green on GitHub (required checks, L136) | The product owner approves the merge; nothing reaches `main` except through a pull request, for anyone (L136) |

**Phase setup work the standard itself defines** (Phase 1's rails, Appendix C) has no intent or spec: it runs as one plan, approved once, built in slices, each closed with pasted proof (L123). Product features always take the full chain above.

The product owner holds both the product-owner role and, under Raphael Mendoza's delegation (L115), the lead's approvals.

## 3. Cadence: features and phase gates, no sprints (L121)

- **Per feature:** one pipeline entry at a time through the chain above, with the full §5 list at its end.
- **Per phase:** phases end on conditions, not dates (standard C.1). At each phase end:
  1. a fresh-context verifier agent runs every check;
  2. a gate report, `phase-reports/phase-<N>.md`, lists each gate condition with its evidence (pasted outputs, the DONE entries, screenshots);
  3. the documents are synced and the modules page republished;
  4. the product owner, who did not write the code, reads and signs it. A gate signed by whoever did the work is not a gate.
- **Quarterly** (standard Phase 6): the audit, the `EXCEPTIONS.md` expiry sweep (current entries expire 2027-04-02) and the version-floor review.

## 4. Evidence: no claim without proof (L121)

A claim that something works carries:
- **pasted command output with its exit code**: `npm run verify` (it ends `ALL GREEN`), and any test, query or script relied on. Never "should work", "looks fine" or "probably";
- **screenshots rendered by a test** for any screen change: light and dark, phone and tablet;
- **a traceability table** for a feature: acceptance criterion → test → result.

If something was not run, say so. If a step was skipped, say so. A partial result is reported as partial.

## 5. Tests (standard §7, §8.4; L121)

- **If a test fails, fix the code, not the test.**
- An existing test changes only when `plan/<id>.md` names it and the spec change behind it (C1); list each changed test with a reason.
- A flaky test is a failure: no retry until green, no skip.
- A fixed bug gets a regression test where possible, and its header names the bug.
- No coverage percentage: coverage is criterion-to-test traceability.

## 6. Hooks: what enforces this (L121; built in Phase 1)

| Hook | Runs | Blocks |
|---|---|---|
| `.githooks/pre-commit` | every commit | a staged `.env` (except `.example`); a duplicate changelog entry; a failing linter for the changed files. Raises the patch version of each surface the commit touches (L129; minor and major by hand) and stamps the top changelog entry's version and date. |
| `npm run verify` (`tools/lib/verify-lock.js`) | every run, a partial one too (not `--list`, not CI) | a second run at the same time on this machine: it waits for the first (a lock file in the system temp folder; it names the holder, gives up with exit 2 after `GABAY_VERIFY_LOCK_WAIT_MS`, default 15 minutes), because all runs share `gabay_dev` and the emulator ports. Name your run with `GABAY_VERIFY_OWNER` |
| `.githooks/pre-push` | every push | the push, when `npm run verify` fails; when code files have uncommitted or untracked changes (verify checks the working tree, so it must equal what is pushed); when a pushed ref, peeled to its commit, is not the checked-out commit (deletions pass; S5 review) |
| GitHub Actions | every push and PR; the e2e suite on a schedule | the merge, when the lint fails; uploads the server log on failure |
| `.claude/settings.json` Stop hook | when the main session finishes (L129; coders hand back to it) | finishing until `npm run verify` has run on the current code; a failed run lets the session stop with a "verify FAILED" notice to the product owner, so an agent can still stop to ask a question |
| `.claude/settings.json` Stop hook | when the main session finishes (L130) | finishing when user-facing screens changed with no changelog entry, unless the final message states "Changelog waived: <reason>" (the waiver is in front of the product owner) |
| `.claude/settings.json` after Flutter edits | after any Flutter file edit | a schema-to-form drift |

One-time, after cloning: `git config core.hooksPath .githooks` (README).

## 7. Repository (L121)

A **public** GitHub repository, `dev42025pwd/gabay` (L135; private before), with GitHub Actions for CI. It is created, and anything pushed, only on the product owner's go, after they sign in to the GitHub CLI as that account (L123). Commits carry `dev42025pwd`'s GitHub noreply address, never a work email (L135). **Branch flow (L136):** work happens on a branch; a pull request into `main` merges only when lint and e2e pass and the product owner approves; branch protection has no bypass, the product owner included.

**Never in git (L123):** `Gabay Demo.apk` (too large for a repository) and `db/seeds/sources/internal/` (the penthouse, internal only, L48), besides `.env` and generated output. A clean clone seeds without the penthouse.

**Where documents live (L125):** README.md, CLAUDE.md, REVIEW.md (standard §8.6) and INSTALL.md at the root; every other project document under `docs/`, by purpose: `product/` (PRD, Blueprint, pipeline), `process/` (this file, EXCEPTIONS), `testing/` (E2E manuals, smoke guide), `ops/` (runbook, incidents, and later the per-release deploy plans), `reference/` (background only). Pipeline artifacts stay in `intent/`, `spec/` and `plan/`; `plan.html`, the standard and the reference HTML stay at the root. A new document goes in the folder that matches its purpose; a new folder is a ruling.

**Node:** Node 22 for Gabay (the Cloud Functions runtime), through fnm, which reads `.nvmrc` per folder; the machine's Node 24 stays the default elsewhere (L123, amended by L124: nvm-windows switches every terminal at once).

## 8. Models: who does what (L62, L122)

The product owner: "use sonnet 5.5 for well defined coding but if it requires in depth analysis and decisions, use either opus or fable depending the weight but consult to me first for every important scenario".

- **Well-defined coding** (an approved spec and plan, nothing left to decide): Claude Sonnet 5.5, `claude-sonnet-5-5`. These are the coder agents and test-verifier.
- **In-depth analysis and decisions:** Claude Opus 5.5 (`claude-opus-5-5`) or, for the heaviest, Claude Fable 5.1 (`claude-fable-5-1`). These are spec-writer, dod-reviewer and native-ble (L62), and the main session.
- **Consult first:** every important scenario goes to the product owner before work starts on it. That includes moving a task off Sonnet onto Opus or Fable, and any use of Fable at all. Ask with AskUserQuestion (§1), with the recommendation and the reason for the weight.
- The pins sit in each agent's `model:` line. They change only by a ruling recorded here and in `plan.html`.
