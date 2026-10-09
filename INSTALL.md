# Gabay — INSTALL.md

> **Version**: 0.2 | **Date**: 2026-10-09 | **Status**: Phase 1 (rails built, S0–S7; synced at the S8 gate). First written as the Phase 0 stub (standard §2; plan.html L115) | **Audience**: developers bringing up a machine | **Scope**: development environment; deployment is in `docs/ops/DEPLOYMENT_RUNBOOK.md`

## Which path?

| You want to… | Go to |
|---|---|
| Develop on your own machine (the only supported setup today, L109) | **A. Local development** |
| Deploy to Firebase | `docs/ops/DEPLOYMENT_RUNBOOK.md`, and only on the product owner's call |
| Use Docker | Not supported. No Docker setup exists; local PostgreSQL is installed natively |
| Host for several mall operators | Not a separate install: one deployment serves every tenant (Blueprint §2.6) |

## A. Local development

Order: A.2 (tools and the repository), then A.1 (the database), A.1b (the seed), A.1c (the API), A.3 (the app), A.4 (the full check).

### A.1 The database

1. **PostgreSQL 18.6** (Blueprint Part 1 pin; Cloud SQL's default major, L115). On Windows:
   ```powershell
   winget install --id PostgreSQL.PostgreSQL.18 --exact --source winget
   ```
   Port 5432, user `postgres`. Put the password you choose in your own `.env` (`PGPASSWORD`), never in a committed file.
2. **Create the database and check the schema** (it must run twice with no errors):
   ```sh
   psql -U postgres -h localhost -c "CREATE DATABASE gabay_dev"
   psql -U postgres -h localhost -d gabay_dev -v ON_ERROR_STOP=1 -f db/schema.sql
   psql -U postgres -h localhost -d gabay_dev -v ON_ERROR_STOP=1 -f db/schema.sql
   ```
   Expected (schema 0.14, 2026-10-07): both exit 0; 56 tables, 133 indexes, 1 trigger in schema `gabay`.

### A.1b The local test seed (built early, L120)

```sh
cd db/seeds
npm ci               # pg 8.23.1 and firebase-tools 15.32.1 (exact versions, committed lockfile)
npm run seed         # starts the Auth emulator (Node, no Java needed); fill PG* and SEED_PW_* in .env first
```

It creates the two test tenants, their venues and the six `@gabay.test` accounts; see `db/seeds/README.md`. Put your spike exports in `db/seeds/sources/spike-exports/` and run it again.

### A.1c The API and the database tools (Phase 1, slice S2)

Node 22 is required (see A.2 for fnm). Fill `.env` from `.env.example` first (the `PG*` keys are required; the API stops at start-up and names any missing key).

```sh
cd functions && npm ci && cd ..      # the API's pinned packages (exact versions, committed lockfile)
cd db/tools && npm ci && cd ../..    # the database scripts' own packages (pg 8.23.1)

npm run api:test      # the API tests (node --test) against the local gabay_dev; they create only TEMP tables
npm run api:lint      # ESLint and Prettier check; both exit non-zero on a violation
npm run setup-db      # dev mode: db/schema.sql -> db/migrations -> the test seed (no Java needed). RESETS gabay_dev
npm run setup-db -- --bootstrap     # schema -> reference seed (platform lookups, roles) -> tenant provisioning (Phase 2)
npm run migrate       # apply db/migrations in order (none exist yet; it says so and exits 0)
```

`setup-db` options: `--stop-on-error`, `--skip-schema`, `--skip-migrations`, `--skip-seed`. It prints the schema's table, index and trigger counts (expected 56, 133, 1). The API tests need a schema in `gabay_dev`; `setup-db` creates it.

To run the API in the Functions emulator (no Firebase project, nothing is deployed):

```sh
db/seeds/node_modules/.bin/firebase emulators:start --only functions --project demo-gabay
curl http://127.0.0.1:5001/demo-gabay/asia-southeast1/api/api/health     # {"status":"ok","db":"ok"}
```

### A.2 Tools and the repository (do these first)

1. **Node.js 22** (Blueprint Part 1; the Cloud Functions runtime). On Windows, install fnm (`winget install Schniz.fnm`), run `fnm install 22`, and add `fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression` to your PowerShell profile. The repository's `.nvmrc` then selects Node 22 inside it and leaves your default Node elsewhere (L124). In Git Bash, call fnm by its full path and use `npm.cmd`:
   ```sh
   "$LOCALAPPDATA/Microsoft/WinGet/Links/fnm.exe" exec --using=22 -- npm.cmd run verify
   ```
2. **Flutter 3.47.5** (Dart 3.13; the patch CI installs) with the Android SDK (API 24–37). Xcode on the team's Mac for iOS (P1-05).
3. **Enable the git hooks**, once per clone (pre-commit: the secret guard, the changelog-duplicate guard and the structural linters on the staged files, then the app's version bump and changelog stamp when a commit touches the shopper app or the admin page, L129; pre-push: the full `npm run verify`):
   ```sh
   git config core.hooksPath .githooks
   ```
4. **The environment file:** copy `.env.example` to `.env` and fill it in: the `PG*` keys for your local PostgreSQL and every `SEED_PW_*` for the six test accounts. `.env` is never committed (the pre-commit hook refuses it).
5. **The Firebase Emulator Suite** comes with `firebase-tools` 15.32.1 in `db/seeds` (A.1b); there is no global install. Projects are local only (`demo-gabay`). RECALLED: how far the emulators cover SQL Connect and scheduled functions; checked when a feature first needs them (Blueprint §2.6).

### A.3 The Flutter app (`app/`, slice S3)

One Flutter project, two entry points (Blueprint §2.3). Run everything from `app/`; there is no Node step.

```sh
cd app
flutter pub get
flutter analyze                       # must print "No issues found!"
flutter test                          # every unit and widget test

# Shopper app (phone or emulator). Debug builds call the local Functions emulator.
flutter run -t lib/main_mobile.dart
#   Android emulator: reach the host as 10.0.2.2, not 127.0.0.1:
#   flutter run -t lib/main_mobile.dart --dart-define=API_BASE=http://10.0.2.2:5001/demo-gabay/asia-southeast1/api

# Admin web page (path URLs, no #)
flutter run -d chrome -t lib/main_admin.dart

# Test-rendered screenshots: both shells, light and dark, phone and tablet, plus the About page, the message banners and the admin development banner (24 PNGs)
flutter test test/screenshot_test.dart --dart-define=SHOTS_OUT=<an existing folder outside the repo>

# Builds. A release build REQUIRES --dart-define=API_BASE=<https url>; without it the app refuses to start.
flutter build web -t lib/main_admin.dart --dart-define=API_BASE=<https url>
#   The admin page shows its "Development build: no sign-in" banner in every build that is not a release build,
#   and in a release build only with --dart-define=DEV_STUB=true (E-20, until R8 brings sign-in).
flutter build apk --debug -t lib/main_mobile.dart
```

Build stamps come from `--dart-define` (`APP_VERSION`, `BUILD_NUMBER`, `GIT_COMMIT`, `BUILD_TIME`); a plain `flutter run` shows the committed fallbacks. Android: `minSdk 24`, applicationId `com.dynamiqes.gabay`. iOS: deployment target 15.0 (Xcode project and `ios/Podfile`); iOS builds need the team's Mac.

### A.4 The full check

Run from the repository root before reporting any work done (CLAUDE.md, WORKING_AGREEMENT). It runs every check in order and ends `ALL GREEN`; the exit code is the number of failures. A failing check's whole output is kept in `.verify/logs/<check>.log`. Only one run at a time on a machine: a second run waits (up to 15 minutes, `GABAY_VERIFY_LOCK_WAIT_MS`) and names who holds it.

```sh
npm run verify              # everything: linters and their tests, ESLint, Prettier, the API and tool tests,
                            # db/schema.sql twice, the seed, the Functions emulator health, flutter analyze, flutter test
npm run lint:structural     # the ten structural linters (rules 2, 3, 4, 6, 7 and more)
npm run lint:test           # the linters' own tests
npm run tools:test          # tests for verify, the hooks and the CI guards
npm run test:schema-forms   # the schema-to-form drift linter alone
npm run ci:guards           # CI's secret and changelog-duplicate guards
npm run api:test            # the API tests (A.1c)
npm run api:lint            # ESLint and Prettier on functions/ (A.1c)
npm run setup-db            # schema -> migrations -> seed; RESETS gabay_dev (A.1c)
npm run migrate             # apply db/migrations (A.1c)
npm run seed                # the test seed (A.1b)
npm run worktree:new -- <name>      # a coder's working copy and database (A.5)
npm run worktree:remove -- <name>   # remove it and drop its database (A.5)
```

The pre-push hook runs `npm run verify`, so a push takes two to five minutes (108 s to 261 s measured in S7 and S8).

### A.5 Coder working copies

Each coder agent (`api-coder`, `flutter-coder`, `engine-coder`, `native-ble`, `test-verifier`) works in its own copy of the repository, so branches, files and the database never collide with the main folder or another coder (plan/PH1-worktrees.md). Run these in the **main folder** (not inside a copy), with Node 22, PostgreSQL running and the main `.env` filled in:

```sh
npm run worktree:new -- api-coder              # branch wt/api-coder/<date> from the fetched origin/main
npm run worktree:new -- api-coder my-branch    # or on a named branch (an existing one is checked out as it is)
npm run worktree:remove -- api-coder           # refuses a copy with uncommitted changes
npm run worktree:remove -- api-coder --force   # removes it anyway
```

`worktree:new` fetches `origin`, adds a git worktree in `..\Gabay-wt\<name>` (a sibling of the main folder), writes that copy's own `.env` (the main one with only `PGDATABASE` changed to `gabay_wt_<name>`, hyphens turned into underscores; no value is printed), creates the database if it is missing, copies `db/seeds/sources/internal/` from the main folder when it is there (it stays git-ignored and is never committed), runs `npm ci` in `functions/`, `db/tools/` and `db/seeds/` and `flutter pub get` in `app/`, then `npm run setup-db` (under the verify lock, because the seed uses the shared emulator ports). `worktree:remove` removes the worktree and drops the database; the branch and its commits stay. Each copy holds its own `node_modules` and build folders, so allow disk for each one. The default branch `wt/<name>/<date>` is reused when it already exists (a second copy of the same name on the same day picks up the kept branch). `test-verifier` works in the coder's copy of the work it tests by default, and has a copy of its own only when the task says so. The Claude Code Stop hooks always check the main folder and also the working copy the shell is in. The git hooks run in every copy (`core.hooksPath` is shared); `npm run verify` in a copy runs against that copy's database and waits for the lock like any other run.

## Gotchas

- The schema's first teardown run prints "does not exist, skipping" notices; they are not errors.
- Never point a local setup at a Firebase project: there is none until the product owner's first deploy (L109).
