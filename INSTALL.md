# Gabay — INSTALL.md

> **Version**: 0.1 stub | **Date**: 2026-10-07 | **Status**: Phase 0 stub (standard §2; plan.html L115) | **Audience**: developers bringing up a machine | **Scope**: development environment; deployment is in `DEPLOYMENT_RUNBOOK.md`

## Which path?

| You want to… | Go to |
|---|---|
| Develop on your own machine (the only supported setup today, L109) | **A. Local development** |
| Deploy to Firebase | `DEPLOYMENT_RUNBOOK.md`, and only on the product owner's call |
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
npm run seed         # needs Java 11+ for the Auth emulator; fill PG* and SEED_PW_* in .env first
```

It creates the two test tenants, their venues and the six `@gabay.test` accounts; see `db/seeds/README.md`. Put your spike exports in `db/seeds/sources/spike-exports/` and run it again.

### A.2 Added in Phase 1 (not yet written)

- Flutter 3.47.x and Dart 3.13.x; Android SDK (API 24–37); Xcode on the team's Mac for iOS (P1-05).
- Node.js 22 LTS and `firebase-tools` 15.x. On Windows, install fnm (`winget install Schniz.fnm`), run `fnm install 22`, and add `fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression` to your PowerShell profile: the repository's `.nvmrc` then selects Node 22 inside it and leaves your default Node elsewhere (L124).
- The Firebase Emulator Suite (Auth, Functions, Storage, Hosting). RECALLED: how far the emulators cover SQL Connect and scheduled functions; checked at Phase 1 (Blueprint §2.6).
- `git config core.hooksPath .githooks` (README).
- Copy `.env.example` to `.env` and fill it in.
- The test seed (P0-02, L119): tenants "Demo Malls" (Aurora, Bayview Grand, Meridian Twin Malls, Skyline Spire; no beacons) and "Spike Venues" (the penthouse, MEZZ office and your exported spike venues), plus six accounts (`superadmin@`, `malladmin@`, `editor@`, `viewer@`, `malladmin.demo@`, `shopper@`, all `@gabay.test`). Fill the `SEED_PW_*` keys in `.env` first.
- The verification command.

## Gotchas

- The schema's first teardown run prints "does not exist, skipping" notices; they are not errors.
- Never point a local setup at a Firebase project: there is none until the product owner's first deploy (L109).
