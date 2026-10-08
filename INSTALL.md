# Gabay — INSTALL.md

> **Version**: 0.1 stub | **Date**: 2026-10-07 | **Status**: Phase 0 stub (standard §2; plan.html L115) | **Audience**: developers bringing up a machine | **Scope**: development environment; deployment is in `docs/ops/DEPLOYMENT_RUNBOOK.md`

## Which path?

| You want to… | Go to |
|---|---|
| Develop on your own machine (the only supported setup today, L109) | **A. Local development** |
| Deploy to Firebase | `docs/ops/DEPLOYMENT_RUNBOOK.md`, and only on the product owner's call |
| Use Docker | Not supported. No Docker setup exists; local PostgreSQL is installed natively |
| Host for several mall operators | Not a separate install: one deployment serves every tenant (Blueprint §2.6) |

## A. Local development

### A.1 Done today (Phase 0)

1. **PostgreSQL 18** (Blueprint Part 1 pin; Cloud SQL's default major, L115). On Windows:
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
npm install          # pg 8.23.1 and firebase-tools 15.32.1 (pinned)
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

### A.2 Added in Phase 1 (not yet written)

- Flutter 3.47.x and Dart 3.13.x; Android SDK (API 24–37); Xcode on the team's Mac for iOS (P1-05).
- Node.js 22 LTS and `firebase-tools` 15.x. On Windows, install fnm (`winget install Schniz.fnm`), run `fnm install 22`, and add `fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression` to your PowerShell profile: the repository's `.nvmrc` then selects Node 22 inside it and leaves your default Node elsewhere (L124).
- The Firebase Emulator Suite (Auth, Functions, Storage, Hosting). RECALLED: how far the emulators cover SQL Connect and scheduled functions; checked at Phase 1 (Blueprint §2.6).
- `git config core.hooksPath .githooks` (README).
- Copy `.env.example` to `.env` and fill it in.
- The test seed (P0-02, L119): tenants "Demo Malls" (Aurora, Bayview Grand, Meridian Twin Malls, Skyline Spire; no beacons) and "Spike Venues" (the penthouse, MEZZ office and your exported spike venues), plus six accounts (`superadmin@`, `malladmin@`, `editor@`, `viewer@`, `malladmin.demo@`, `shopper@`, all `@gabay.test`). Fill the `SEED_PW_*` keys in `.env` first.
- The verification command.

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

# Test-rendered screenshots: both shells, light and dark, phone and tablet (8 PNGs)
flutter test test/screenshot_test.dart --dart-define=SHOTS_OUT=<an existing folder outside the repo>

# Builds. A release build REQUIRES --dart-define=API_BASE=<https url>; without it the app refuses to start.
flutter build web -t lib/main_admin.dart --dart-define=API_BASE=<https url>
flutter build apk --debug -t lib/main_mobile.dart
```

Build stamps come from `--dart-define` (`APP_VERSION`, `BUILD_NUMBER`, `GIT_COMMIT`, `BUILD_TIME`); a plain `flutter run` shows the committed fallbacks. Android: `minSdk 24`, applicationId `com.dynamiqes.gabay`. iOS: deployment target 15.0 (Xcode project and `ios/Podfile`); iOS builds need the team's Mac.

## Gotchas

- The schema's first teardown run prints "does not exist, skipping" notices; they are not errors.
- Never point a local setup at a Firebase project: there is none until the product owner's first deploy (L109).
