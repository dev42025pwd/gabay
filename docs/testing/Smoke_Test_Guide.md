# Gabay — Smoke Test Guide

> **Version**: 0.1 stub | **Date**: 2026-10-07 | **Status**: Phase 0 stub (standard §2, §7.4; plan.html L115). Revised in place, never forked to `_v2` | **Audience**: whoever checks a fresh build end to end | **Estimated time**: about 2 hours once written

**Run the automated suite first** (Phase 1 adds the command). This guide is the human pass from a fresh database to every module.

## Phase 1 — Database bootstrap

Verification today (2026-10-07, L115):

```sql
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'gabay';   -- expected 56
SELECT count(*) FROM pg_indexes WHERE schemaname = 'gabay';                     -- expected 133 (schema 0.14)
SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal;                         -- expected 1 (frozen package)
```

Seed row counts are added with P0-02.

## Phases 2+ — one per module

Written as each P0 entry lands: venue setup (P0-01), seeds (P0-02), publish (P0-03), shopper shell (P0-04), search (P0-05), routing (P0-06), and on through P0-14. Each has 1–8 cases with the count in its heading.

## Summary

| Phase | Cases | Pass |
|---|---|---|
| 1 Database bootstrap | 3 | ☐ |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "does not exist, skipping" on the first schema run | The teardown drops tables that aren't there yet | None: not an error |
