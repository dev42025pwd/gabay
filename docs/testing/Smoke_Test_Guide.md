# Gabay — Smoke Test Guide

> **Version**: 0.2 | **Date**: 2026-10-09 | **Status**: Phase 1 (synced at the S8 gate); the module phases are written as each P0 entry lands (standard §2, §7.4; plan.html L115). Revised in place, never forked to `_v2` | **Audience**: whoever checks a fresh build end to end | **Estimated time**: about 2 hours once written

**Run the automated suite first:** `npm run verify` from the repository root must end `ALL GREEN` (exit 0; INSTALL.md A.4). This guide is the human pass from a fresh database to every module.

## Phase 1 — Database bootstrap

Verification today (2026-10-07, L115):

```sql
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'gabay';   -- expected 56
SELECT count(*) FROM pg_indexes WHERE schemaname = 'gabay';                     -- expected 133 (schema 0.14)
SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal;                         -- expected 1 (frozen package)
```

Seed (`npm run seed`; `db/seeds/README.md`). It prints one line per venue with its row counts, one `Account ·` line per account, and ends `Seed committed.`:

- [ ] Two tenants: Demo Malls (Aurora Mall, Bayview Grand, Meridian Twin Malls, Skyline Spire) and Spike Venues (the penthouse and MEZZ office, plus any spike exports; an internal source that is not in git is reported as skipped).
- [ ] Six accounts, all `@gabay.test`: `superadmin`, `malladmin`, `editor`, `viewer`, `malladmin.demo`, `shopper`.

Per-table seed counts are added with P0-02.

## Phase 1b — The API and the two app shells (3 cases)

1. [ ] **API health.** Start the Functions emulator (INSTALL.md A.1c), then `curl http://127.0.0.1:5001/demo-gabay/asia-southeast1/api/api/health`. Expected: `{"status":"ok","db":"ok"}`. With PostgreSQL stopped: HTTP 503 and `{"error":"Database unavailable"}`.
2. [ ] **Shopper shell.** `flutter run -t lib/main_mobile.dart` (in `app/`): the app opens in the terracotta theme, with its About page and build stamp. No feature exists yet.
3. [ ] **Admin shell.** `flutter run -d chrome -t lib/main_admin.dart`: the admin page opens with path URLs (no `#`) and its About page.

## Phases 2+ — one per module

Written as each P0 entry lands: venue setup (P0-01), seeds (P0-02), publish (P0-03), shopper shell (P0-04), search (P0-05), routing (P0-06), and on through P0-14. Each has 1–8 cases with the count in its heading.

## Summary

| Phase | Cases | Pass |
|---|---|---|
| 1 Database bootstrap | 3 + seed | ☐ |
| 1b API and app shells | 3 | ☐ |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "does not exist, skipping" on the first schema run | The teardown drops tables that aren't there yet | None: not an error |
