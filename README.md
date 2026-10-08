# Gabay

> **Version**: 0.1 stub | **Date**: 2026-10-07 | **Status**: Phase 0 stub (standard §2; plan.html L115) | **Audience**: anyone cloning the repo | **Scope**: stack, layout, doc index, first-time setup, commands

Gabay is an indoor wayfinding app for shopping malls in the Philippines: a shopper app (Android and iOS) that finds stores and guides people across floors, and an admin web page where mall staff draw and publish their maps. See `docs/product/GABAY_PRD.md` §1 for the product, and `plan.html` for every decision (L1–L117).

## State

**Phase 1 was declared on 2026-10-07 (L122), after the product owner signed the schema read.** There is no git repository, product code or build yet; the Phase 1 rails come first, each on an approved plan.

## One-time setup after cloning (do this first)

```sh
git config core.hooksPath .githooks
```

Without this the pre-commit and pre-push hooks never run (standard §2, §8.1).

## Checking your work

```sh
npm run verify        # in Git Bash: fnm exec --using=22 -- npm.cmd run verify
```

One line per check (Node 22, `node --check`, the structural linters and their tests, ESLint and Prettier, the schema applied twice, the API and database-tool tests that need it, the seed, the Functions emulator's health, `flutter analyze`, `flutter test`), then `ALL GREEN` or the list of failures. The exit code is the number of failures. It takes minutes and resets the local `gabay_dev` database (the seed refills it). Every run, green or red, is recorded in `.verify/last-run.json` with a fingerprint of the code it checked. The console shows the last 30 lines of a failing check; everything the check printed is saved first to `.verify/logs/<check>.log` (at most 5 MB: past that, its start and end with a line saying how much was cut), and the FAIL line names the file. Each run empties `.verify/logs/` right after it has the lock, so the folder holds the latest run's failures only and a green run leaves it empty (`--list` never touches it). A log still held open by another program is named in one line and the rest are removed; a check cut off by its time-out says `TIMED OUT` in its output and log; the Claude Stop hook's "verify FAILED" notice points to the folder. The folder is git-ignored with the rest of `.verify/`. `npm run verify -- --only eslint,prettier` runs some checks; that is a partial run and never counts as a verify.

One run at a time on a machine: every run (a partial one too) uses `gabay_dev` and the emulator ports, so it takes a lock file in the system temp folder (`gabay-verify.lock`) for its whole run. The lock follows the temp folder of the user running it (`os.tmpdir()`: the `TEMP` or `TMP` variable on Windows, `TMPDIR` or `/tmp` on Linux and macOS), so two people on one machine with different temp folders do not see each other's lock. A second run prints `verify is busy: held by <who> (pid, folder, commit) since <time>` at once and every minute, and waits; after `GABAY_VERIFY_LOCK_WAIT_MS` milliseconds (default 15 minutes) it stops with exit 2 and records nothing. `GABAY_VERIFY_OWNER` names your run in that line (for example `api-coder`; otherwise your user and folder). A lock whose process is gone is cleared with one line, by one run at a time: it first takes a short claim file beside the lock (`gabay-verify.lock.clearing`), reads the lock again and removes it only if it is still the same dead lock; a run that does not get the claim keeps waiting, and a claim older than 30 seconds (its run died) is removed with a line. The lock is released when the run ends, fails, is interrupted or its terminal is closed; the release retries for about a second, and if the lock file is still there (another program holds it open) one line `verify: could not remove its lock <file>` says so, and the next run clears it once the process has ended. A lock that cannot be removed (another program holds it open) is waited on like a live one. If the wait ends with exit 2, check that the process number named is a node process running verify before ending it: the number can belong to another program by now. `--list` and CI (`CI=true`) take no lock.

What the hooks do (`WORKING_AGREEMENT.md` §6):

| Hook | Does |
|---|---|
| `.githooks/pre-commit` | refuses a staged `.env` (not `.env.example`), a repeated changelog entry, and what the structural linters refuse in the STAGED content (`migrations-immutable --staged` too); then raises the patch version of each app surface the commit touches (0.1.0 to 0.1.1) and stamps that surface's top changelog entry with the version and today's date in Asia/Manila (L129). A version you raised by hand is kept. It also works for `git commit -- <paths>`. |
| `.githooks/post-commit` | puts the index back in step after a stamped `git commit -- <paths>` |
| `.githooks/pre-push` | verify checks the working tree, so the push is refused unless the refs pushed are the checked-out commit (deleting a remote branch needs no verify) and code has no uncommitted or untracked changes; then it runs `npm run verify` and the push is refused if that fails |
| `.claude/settings.json` | the main session may not finish until `npm run verify` has run on the current code (a failed run is shown, not a trap); nor when screens changed with no changelog entry, unless the final message has a line `Changelog waived: <reason>` (L130); and the schema-to-form drift linter runs after every Dart edit |

GitHub Actions (`.github/workflows/`, L133, L135, L136): the repository is public, so minutes on standard runners are free. Every change reaches `main` through a branch and a pull request, `lint` and `e2e` are required checks, and nobody can bypass them (set on GitHub right after the first push, L136). `lint.yml` (every pull request, and every push to `main`) runs `npm run ci:guards` (no tracked `.env`, no repeated changelog entry), the migration-history check (`tools/ci-migrations.js`: a pull request against its base, a push to `main` against the tip it had before) and the database-free half of verify; `e2e.yml` (every pull request to `main`, nightly 02:00 Manila, and on demand) runs the database half against PostgreSQL 18; `build.yml` (after lint passes on a push to `main` of this repository, never for a fork) builds the admin web page and a debug APK as artifacts. Each workflow states its cost in its header.

## Stack (Blueprint Part 1 holds the pins)

- **Shopper app and admin web page:** Flutter 3.47 (one project, `main_mobile.dart` and `main_admin.dart`), riverpod, go_router, dio. Android 7.0+ and iOS 15+ (L103).
- **API:** Node.js 22 + Express inside one Cloud Function for Firebase (L98).
- **Database:** PostgreSQL (Cloud SQL through Firebase SQL Connect, Singapore), raw parameterized SQL through `pg`, no ORM. PostgreSQL 18 locally (L115).
- **Sign-in:** Firebase Auth. **Files:** Cloud Storage for Firebase. **Admin hosting:** Firebase Hosting.
- **On the phone:** each mall's published map is a read-only SQLite package (FTS5, R*Tree, a CSR walkway graph); routing and positioning run on the phone; positions never leave it (invariant 4).
- Deviations from the Dynamiq standard §1 are in `docs/process/EXCEPTIONS.md` (E-02 to E-14, signed L115).

**Local first (L109):** everything runs on the developer's machine (Firebase Emulator Suite and a local PostgreSQL). Nothing is deployed to Firebase, and no store build is published, until the product owner calls it.

## Repository layout (Blueprint §2.3; created in Phase 1)

| Path | What |
|---|---|
| `api/` | Express app, routes, services, engines (publish, graph, planner, live status) |
| `db/` | `schema.sql` (the target schema), migrations (Phase 1), `SCHEMA_READING_GUIDE.md` |
| `lib/` | Flutter: `core/` (positioning, routing, package, map3d, voice), `features/` (shopper, editor, admin) |
| `.githooks/` | pre-commit, post-commit and pre-push hooks |
| `.github/workflows/` | lint, e2e and build (L133) |
| `tools/` | `verify.js` (`npm run verify`), `lint/` (the structural linters), `hooks/` (the pre-commit logic) |
| `.claude/agents/` | the build agents, dormant until Phase 1 (L64) |
| `docs/` | the project documents, grouped by purpose (L125); README, CLAUDE.md, REVIEW.md and INSTALL.md stay at the root |

## Documents

| Document | Answers |
|---|---|
| `docs/product/GABAY_PRD.md` | Why, and what each feature must do |
| `docs/product/GABAY_MASTER_BLUEPRINT.md` | How: stack pins, architecture, schema intent, module anchors |
| `docs/product/FEATURE_PIPELINE.md` | What is built, in what order, and its status |
| `plan.html` | Every decision, with evidence (decision log L1–L117) |
| `docs/process/WORKING_AGREEMENT.md` | How we work: decisions, approvals, evidence, tests, the repository |
| `docs/process/EXCEPTIONS.md` | Signed deviations from the standard, with expiry dates |
| `db/schema.sql` | The PostgreSQL schema (56 tables) |
| `INSTALL.md` | Bringing up a development machine |
| `docs/ops/DEPLOYMENT_RUNBOOK.md` | Deploying to Firebase, on the product owner's call |
| `docs/testing/E2E_Test_Cases_Manual.md`, `docs/testing/E2E_Frontend_Test_Cases_Manual.md` | Release-gate manuals (Phase 1+) |
| `docs/testing/Smoke_Test_Guide.md` | The whole-system smoke pass (Phase 1+) |
| `docs/ops/INCIDENTS.md` | Incidents, newest first |
| `CLAUDE.md` | The contract for AI agents working here |
| `REVIEW.md` | The review passes |
| `docs/reference/Indoor mall navigation app design notes and decisions.md` | Background design notes only (L110) |
| `Engineering Standards.html` | The Dynamiq standard v1.0 |

## Commands

Run, test and the single verification command are added here in Phase 1 (standard §8.4). Until then:

```sh
psql -U postgres -h localhost -d gabay_dev -v ON_ERROR_STOP=1 -f db/schema.sql   # the schema (run twice; both exit 0)
cd db/seeds && npm install && npm run seed                                       # the local test seed (L119, L120)
```

## What does not exist (by decision)

- No QR codes anywhere (L107). No web directory (P2-01 cancelled).
- No background location or background BLE scanning (invariant 5).
- No server-side positions or crowd learning from phones (invariant 4, L110).
- No Firestore or Realtime Database (L98).
