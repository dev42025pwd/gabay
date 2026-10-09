# Gabay — E2E Test Cases Manual (backend and API)

> **Version**: 0.1 stub | **Date**: 2026-10-07 | **Status**: Phase 0 stub (standard §2, §7.3; plan.html L115); cases are written from Phase 1 | **Audience**: the tester running a release gate | **Scope**: every API route, against a fresh local database

## How to use

- The release gate: **any ✘ blocks release; all ☐ → ✅ = SYSTEM PASS.**
- Run against a fresh local database with the seed venues (P0-02); the seed is deterministic, so expected counts are exact.
- Run the automated suite first (Phase 1 adds the command); this manual covers what it does not.

## Test accounts

Local only (L119): all in the Firebase Auth emulator (project `demo-gabay`), passwords in the local `.env` as `SEED_PW_*`, never in this file.

| Role (L41) | Account | Tenants (`UserRole`) |
|---|---|---|
| SuperAdmin | `superadmin@gabay.test` | platform (no tenant row) |
| Mall admin | `malladmin@gabay.test` | Demo Malls and Spike Venues |
| Mall admin (one tenant) | `malladmin.demo@gabay.test` | Demo Malls only |
| Venue editor | `editor@gabay.test` | Demo Malls and Spike Venues |
| Viewer | `viewer@gabay.test` | Demo Malls and Spike Venues |
| Shopper | `shopper@gabay.test` | none (a `ShopperAccount`, optional sign-in, D1) |

## Pre-flight

1. Database created and `db/schema.sql` applied (INSTALL.md A.1).
2. Migrations applied (Phase 1).
3. Seeds loaded (P0-02).
4. Firebase emulators running (Phase 1).

## Phases

One table per phase, five columns, IDs `<phase>.<n>`. A case inserted later takes a letter suffix (`3A.1`) so nothing renumbers. One heading form, append-only.

| TC# | Test Case | API or Steps | Expected | Pass |
|---|---|---|---|---|
| — | Product cases are written one phase per pipeline entry (P0-01 first); Phase 2's identity cases follow | — | — | ☐ |

### Phase 2 — Authentication and GET /api/me (P2-S1)

Setup: the API running against the emulator (`FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` in `.env`, the emulator started with the seed's data). **Get a token** for an account: `curl -s -X POST "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=x" -H "content-type: application/json" -d '{"email":"<account>","password":"<its SEED_PW_*>","returnSecureToken":true}'` and take `idToken`. **Call:** `curl -i <api>/api/me -H "Authorization: Bearer <idToken>"`. Until P2-S3's migration seeds the `PermissionRoute` rows, every `permissions` object is `{}`; the cases below check roles and tenants.

| TC# | Test Case | API or Steps | Expected | Pass |
|---|---|---|---|---|
| 2.1 | No token | `GET /api/me` with no Authorization header | 401 `{"error":"Authentication required"}` | ☐ |
| 2.2 | Wrong scheme | `Authorization: Basic abc` | 401 `{"error":"Authentication required"}` | ☐ |
| 2.3 | Bad token | `Authorization: Bearer abc.def.ghi` | 401 `{"error":"Invalid session"}` | ☐ |
| 2.4 | SuperAdmin | token of `superadmin@gabay.test` | 200; `isSuperAdmin` true, `platformRoles` `["SUPERADMIN"]`, `tenants` `[]` | ☐ |
| 2.5 | Mall admin, two tenants | token of `malladmin@gabay.test` | 200; `isSuperAdmin` false; `tenants` DEMO_MALLS and SPIKE_VENUES, each `roles` `["MALL_ADMIN"]` | ☐ |
| 2.6 | Venue editor | token of `editor@gabay.test` | 200; the same two tenants, `roles` `["VENUE_EDITOR"]` | ☐ |
| 2.7 | Viewer | token of `viewer@gabay.test` | 200; the same two tenants, `roles` `["VIEWER"]` | ☐ |
| 2.8 | Tenant isolation: one tenant only | token of `malladmin.demo@gabay.test` | 200; `tenants` is DEMO_MALLS only (no SPIKE_VENUES) | ☐ |
| 2.9 | The header does not choose tenants here | 2.8 again with `X-Tenant-Id: 999` (and with SPIKE_VENUES' id) | the same body as 2.8 | ☐ |
| 2.10 | Shopper on an admin route | token of `shopper@gabay.test` | 403 `{"error":"This account has no access"}` | ☐ |
| 2.11 | Valid Firebase user, no Gabay account | create a user in the emulator that is in neither `AppUser` nor `ShopperAccount`; call with its token | 403 `{"error":"This account has no access"}` | ☐ |
| 2.12 | Inactive user | `UPDATE gabay.AppUser SET IsActive = FALSE WHERE Email = 'viewer@gabay.test'`; call with a token from before and after | 401 `{"error":"Account is not active"}`; set `IsActive` back to TRUE and it is 200 | ☐ |
| 2.13 | Revoked token | emulator: `POST .../v1/projects/demo-gabay/accounts:update` (header `Authorization: Bearer owner`) with `{"localId":"<uid>","validSince":"<epoch seconds a few seconds ahead>"}`; call with the old token | 401 `{"error":"Invalid session"}` | ☐ |
| 2.14 | User disabled in Firebase | the same call with `{"localId":"<uid>","disableUser":true}` | 401 `{"error":"Account is not active"}`; `false` restores 200 | ☐ |
| 2.15 | Token older than the limit | insert `GlobalSetting` (TenantId NULL, `auth.idTokenMaxAgeS`, `2`); wait 31 s for the settings cache (30 s) or restart the API; call with a token more than 2 s old; delete the row afterwards | 401 `{"error":"Session expired"}`; a token signed in just now is 200 | ☐ |
| 2.16 | Firebase unreachable fails closed | stop the Auth emulator; call with a token | 503 `{"error":"Authentication service unavailable"}`, never 200 | ☐ |
| 2.17 | Only GET exists | `POST`, `PUT`, `DELETE /api/me` with a good token | 404 `{"error":"Not found"}` | ☐ |
| 2.18 | Public routes stay public | `GET /api/health` with no token; `GET /api/nothing-here` with no token | 200 `{"status":"ok","db":"ok"}`; 404 `{"error":"Not found"}` | ☐ |
| 2.19 | No secrets in the answer | read any 200 from 2.4 to 2.8 | no Firebase UID, token or password; no `X-Powered-By`; `Cache-Control: no-store` | ☐ |

Planned closing sweeps (§7.3): an RBAC sweep over every route × role; a negative and boundary phase; a creator/updater stamping phase; tenant isolation (rule 2) on every tenant-scoped route.

## Running the automated suite

Phase 1.

## Summary

Generated, never typed (§2 doc conventions). Phase 1.
