# Phase 1 — Rails and guardrails: gate report

> **Version**: 0.2 draft | **Date**: 2026-10-09 | **Plan**: `plan/PH1-rails.md` 1.11, S8 | **Decision rows**: L122 (Phase 1 declared), L123 (plan approved), L124–L147 | **Written by**: the main session (Opus 5.5) | **Reviewed by**: dod-reviewer in a fresh context (AI self-check, not a sign-off; §6) | **Status**: DRAFT; the clean-clone run (§6) is pasted before you sign; E-18 awaits your approval | **Signed**: not yet

## 1. The gate

The standard (Appendix C, Phase 1):

> a deliberately bad commit (a hardcoded colour, an unparameterized query, a `TextFormField` in a view) is blocked by the hooks or CI on an application with zero features.

**Verdict: MET.** Each of the three bad commits is refused by the pre-commit hook (exit 1) and fails `lint` in CI, and the pull request carrying them was blocked from merging (§2).

## 2. The three bad commits

On 2026-10-09 the earlier session pushed three deliberately bad commits on the throwaway branch `s8-gate-probe`, as PR #6 ("S8 GATE PROBE … never to be merged"). They were pushed with `--no-verify`, on purpose.

| # | Commit | What was broken | Rule |
|---|---|---|---|
| 1 | `e391b8b` | A hardcoded colour in a view (`app/lib/shared/components/surface_screens.dart`) | 6 |
| 2 | `74e4066` | A request value interpolated into SQL (`functions/src/routes/health.js`) | 3 |
| 3 | `3d634e1` | A raw `TextFormField` in a view (`surface_screens.dart`) | 7 |

**CI:** lint run 37867154242 failed. These are the lines from `gh run view 37867154242 --log-failed`, read this session:

```
FAIL structural-linters   (0.1 s)  full output: .verify/logs/structural-linters.log (17 lines)
       app/lib/shared/components/surface_screens.dart:70: no-bare-textfield: TextFormField built here: declare a FieldSpec and let app/lib/shared/forms build the widget (rule 7, standard §4.10)
       FAIL no-bare-textfield (22 files, 1 violation(s))
       app/lib/shared/components/surface_screens.dart:63: colour-literals: Color(0x...): colours belong in app/lib/core/theme/gabay_tokens.dart; use Theme.of(context).colorScheme.* (rule 6)
       FAIL colour-literals (21 files, 1 violation(s))
       functions/src/routes/health.js:23: sql-interpolation: a ${...} inside SQL text: bind values as $1..$n parameters; identifiers only from an allow-list map, marked with // sql-identifiers: <reason> (rule 3)
       FAIL sql-interpolation (14 files, 1 violation(s))
       functions/src/routes/health.js:23: tenant-predicate: SQL on tenant-scoped table globalsetting has no TenantId = $n predicate in its WHERE (rule 2); …
       FAIL tenant-predicate (15 files, 1 violation(s))
       4 violation(s).
FAIL prettier             (1.5 s)
FAIL flutter-analyze      (13.7 s)
FAIL flutter-test         (76.2 s)
```

- The run caught all three bad commits, plus a fourth hit: the tenant check, on the same SQL line.
- Prettier, `flutter analyze` and `flutter test` also failed on the same edits.
- e2e (run 37867154130) passed. That was expected: it runs no linters.
- **Merge blocked:** `gh pr view 6 --json mergeStateStatus` gives `BLOCKED`, with the check rollup `lint FAILURE`, `e2e SUCCESS`.
- The PR was closed unmerged at 2026-10-09T00:58:00Z.

**Local hooks (re-run 2026-10-09, the product owner's go):**
- Method:
  - On a throwaway branch `s8-hook-probe` made from `origin/main` (`06f3796`), each probe commit was applied uncommitted (`git cherry-pick --no-commit <commit>`).
  - Then the hook was run (`sh .githooks/pre-commit`: the same script `git commit` runs through `core.hooksPath`), and the file was restored.
  - Nothing was committed or pushed, and the branch was deleted.
- Each refusal, with the passing linter lines cut:

```
=== probe e391b8b: a hardcoded colour in a view
app/lib/shared/components/surface_screens.dart:63: colour-literals: Color(0x...): colours belong in app/lib/core/theme/gabay_tokens.dart; use Theme.of(context).colorScheme.* (rule 6)
FAIL colour-literals (1 file, 1 violation(s))
1 violation(s).
pre-commit: a structural linter refused the staged files
pre-commit exit=1

=== probe 74e4066: an unparameterized query
functions/src/routes/health.js:23: sql-interpolation: a ${...} inside SQL text: bind values as $1..$n parameters; identifiers only from an allow-list map, marked with // sql-identifiers: <reason> (rule 3)
FAIL sql-interpolation (1 file, 1 violation(s))
functions/src/routes/health.js:23: tenant-predicate: SQL on tenant-scoped table globalsetting has no TenantId = $n predicate in its WHERE (rule 2); …
FAIL tenant-predicate (2 files, 1 violation(s))
2 violation(s).
pre-commit: a structural linter refused the staged files
pre-commit exit=1

=== probe 3d634e1: a TextFormField in a view
app/lib/shared/components/surface_screens.dart:68: no-bare-textfield: TextFormField built here: declare a FieldSpec and let app/lib/shared/forms build the widget (rule 7, standard §4.10)
FAIL no-bare-textfield (1 file, 1 violation(s))
1 violation(s).
pre-commit: a structural linter refused the staged files
pre-commit exit=1
```

- The TextFormField is on line 68 here and line 70 in CI, because here it was applied without probe 1's two lines.
- After clean-up, `git status -s` showed no tracked change.

## 3. The slices

| Slice | State | Report | dod-reviewer |
|---|---|---|---|
| S0 Machine (Node 22 via fnm) | DONE 2026-10-07 (L124) | in the plan | none needed |
| S1 Repository foundation | DONE 2026-10-07 | in the plan | none needed |
| S2 API skeleton | DONE 2026-10-07 | `phase-1/S2.md` | acceptable after fixes |
| S3 App skeleton | DONE 2026-10-07 | `phase-1/S3.md` | acceptable after fixes |
| S4 Structural linters | DONE 2026-10-07 | `phase-1/S4.md` | acceptable after fixes |
| S5 Hooks and `npm run verify` | DONE 2026-10-07 | `phase-1/S5.md` | acceptable after fixes |
| S6 CLAUDE.md, sync table, REVIEW.md | DONE 2026-10-08 (one-page item waived, L132) | `phase-1/S6.md` | acceptable with fixes |
| S7 GitHub and CI | DONE 2026-10-09 (L145) | `phase-1/S7.md` | ready for the product owner after six rounds |
| S8 The gate | this report | — | changes needed, then fixed (§6) |

Each slice report is waiting for your signature on this gate.

**Also built during Phase 1, on their own plans:**
- the verify lock (`plan/PH1-verify-lock.md`, L140; PR #3)
- verify's kept logs (`plan/PH1-verify-logs.md`, L141–L142; PR #4)
- the lock fix (`plan/PH1-verify-lock-fix.md`, L143–L144; PR #5)

## 4. S7's three checks carried to S8 (L145)

As of 2026-10-09 (`gh run list`, read this session):

| `S7.md` §5.1 | Check | State |
|---|---|---|
| 3 | A run cancelled by a newer push | **Not exercised yet.** No run in the history is `cancelled`. |
| 6 | The PostgreSQL log after a red e2e | **Not exercised yet.** No e2e has failed; PR #6's e2e passed. |
| 8 | A fork's first pull request waits for approval | **Set, not exercised yet.** No fork has opened a pull request. |

Each is marked proven the first time it happens. None blocks the gate: they cover CI's behaviour on rare events, not the gate itself.

**Follow-up after S8 (L145):** correct `build.yml`'s cache comment (`S7.md` §5.1 item 4) and its pinned snapshot, on a small plan of its own.

## 5. Documents synced

Audited this session (a read-only search agent; the key lines re-read by the main session). Of the six documents, five were behind what Phase 1 built or had a gap (the Blueprint has two rows below). None of this affects the gate itself, but the plan's S8 line asks for them to be synced before you sign. **Fixed 2026-10-09 on the product owner's go** (the table shows what was found; the fixes follow it).

| Document | State | What is behind |
|---|---|---|
| Blueprint Part 1 pins | Mostly synced | Every npm pin and every direct pub package matches the manifests and `pubspec.lock`. Flutter is pinned at 3.47, with 3.47.6 as the "latest seen" (`GABAY_MASTER_BLUEPRINT.md:113`). CI (`lint.yml:84–86`) and this machine (`flutter --version`) both run 3.47.5, which is inside the pin but one patch behind the latest seen, and the row doesn't say so. **Behind:** The e2e database image is the floating `postgres:18` (`e2e.yml:57`), against the pinned 18.6. `flutter_web_plugins` and `flutter_test` have no row. |
| Blueprint §2.3 (the folder layout) | Behind | It names `api/routes/public/`, `services/engines/` and `reference/demo_app/`, none of which exist. It doesn't show the real tree: `functions/src/{config,db,middleware,routes,utils}`, `db/{migrations,seeds,tools}`, `tools/`, `.github/workflows`, `docs/`, `plan/`, `phase-reports/`. |
| `FEATURE_PIPELINE.md` | Behind | Its header still cites plan.html 0.58 (L1–L123). §4 still lists "P1 rails" as an open prerequisite, with per-PR previews. It mentions an `npm run pipeline:totals` that doesn't exist. |
| `INSTALL.md` | Behind | Still a "Phase 0 stub". Its section A.2 has bullets, not steps: fnm and Node 22, `core.hooksPath`, `.env.example`, Flutter 3.47.5, PostgreSQL 18.6. It never gives `npm run verify` or the part scripts. It uses `npm install` where the lockfile calls for `npm ci`. |
| `docs/testing/Smoke_Test_Guide.md` | Behind | Still a Phase 0 stub. It doesn't name `npm run verify`, `GET /api/health`, the two app entry points (`main_mobile.dart`, `main_admin.dart`) or the seed counts. |
| CLAUDE.md Commands | Synced | All 11 root scripts are listed, and every listed command exists. |
| `docs/process/EXCEPTIONS.md` | One gap | `globals` 17.13.0 (an ESLint dev dependency in `functions/`) has no entry, and §1 doesn't name it. ESLint and Prettier are named by the standard, but the file doesn't record that check. |

**The fixes:**

- **Blueprint 0.25:**
  - The "as built" tree also lists the other `tools/*.js` scripts, `db/schema.mssql.sql`, `db/SCHEMA_READING_GUIDE.md` and `.claude/`.
  - The Flutter row names 3.47.5 as the version in use.
  - The SDK row adds `flutter_web_plugins` and `flutter_test`.
  - The PostgreSQL row records CI's floating image and its move to `postgres:18.6`. That move is your choice (L147). It is done in the post-S8 workflow follow-up, with `build.yml`'s cache comment; the e2e log step's `ancestor=postgres:18` filter (`e2e.yml:120`, `:124`) changes with it.
  - §2.3 now lists the real top level and puts each future folder under `functions/src/` or `app/`.
  - The demo app is recorded as kept outside the repository.
- **Pipeline 0.25:** the header cites plan.html 0.81 (L1–L146); the P1 rails line shows S0–S7 done and S8 the gate; the totals note says the script was not built in Phase 1.
- **INSTALL 0.2:**
  - A.2 is now numbered steps: Node 22 via fnm, Flutter 3.47.5, `core.hooksPath`, `.env`, the emulators.
  - A.1 names PostgreSQL 18.6.
  - The seed uses `npm ci`.
  - The new A.4 gives `npm run verify` and every root script.
  - It names the pre-commit hook's version and changelog stamp, and says a push takes two to five minutes.
- **Smoke guide 0.2:** it names `npm run verify` and adds the seed's tenants and accounts, plus three cases: API health (including the 503 when the database is down) and the two app shells.
- **EXCEPTIONS:**
  - **E-18 (`globals`) is added as a request,** with the approval fields blank. **It is in force only once you approve it.**
  - ESLint, `@eslint/js` and Prettier are recorded as checked.
- CLAUDE.md needed nothing.
- **The modules page** (https://claude.ai/artifact/QFDHQAvkiDL93hM76Kb9mt) was republished on 2026-10-09: version 17 with L146, and again with L147 and this gate's state.

## 6. The review and the full check

**dod-reviewer, fresh context (2026-10-09; AI self-check, not a sign-off).** Verdict: changes needed, no Critical.
- **The skill check `S6.md` left for S8 passed.** Before reading any file, the reviewer had `gabay-product-rulings` in its context: it quoted the heading "# Gabay product rulings" and the L103 ruling. That ruling matched `.claude/skills/gabay-product-rulings/SKILL.md:20` word for word. So the skill is preloaded into a fresh subagent.
- **Its own `npm run verify` on the working folder** (HEAD `2215a87` plus these uncommitted documents):

```
ok   node-version ... ok   flutter-test         (9.7 s)   [15 checks, all ok]
ALL GREEN   (111.1 s)
EXIT=0
```

- **It re-checked the CI claims** against GitHub (PR #6, run 37867154242, items 3, 6 and 8) and found them true. CI on `2215a87`: lint 37869178888 and e2e 37869178902 both green.
- **Findings on this report, all fixed:**
  - I-1: the modules page was missing (§5).
  - I-2: the "clean clone" run (below).
  - I-3: S7 had six review rounds, not five (§3).
  - I-4: the PostgreSQL 18.6 pin had no ruling row (now L147). The e2e log filter also changes with it (§5).
  - Nits 1–8.
- **Findings on `plan/PH1-worktrees.md`** (don't block the gate; that plan goes to 1.1 for your approval):
  - I-5: the Claude Code hooks are tied to the main folder.
  - I-6: a fresh copy's seed has no penthouse.
  - I-7: its approval wasn't recorded (now L147).
  - Nits 9–10.

**`npm run verify` on a clean clone** (`plan/PH1-rails.md` §9; your choice of a fresh clone):

*(The run's output is pasted here once it is done: a fresh clone of the pushed commit in a temporary folder outside the repository, with `.env` copied in, never printed.)*

**E-18 (`globals`)** waits for your approval (§5).

## 7. Open, outside the gate

- **Where Gabay's P1 tier sits** between the standard's Phase 4 (P0 only) and the Phase 5 release gate. This goes to you before Phase 4 ends (`S5.md`, plan.html 0.80).
- **What made `.tracker/`, `FEATURES.md` and `PROGRESS.md`** (untracked, not Gabay's; plan.html 0.80, open item).
- **The brand colour.** Yours to supply when it is known.

## 8. Signature

Phase 1 gate met: ______________________ (Genesis Perez, product owner)   Date: __________
