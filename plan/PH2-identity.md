# PH2-identity — Phase 2: identity, access, tenancy, audit

> **Version**: 1.2 | **Date**: 2026-10-09 | **Status**: APPROVED by Genesis Perez, 2026-10-09 (L149; 1.2 adds the S1 and S9 review rulings, L151), with §7's thirteen questions ruled one by one, all as recommended. Phase 2 starts after the coders' working copies (`plan/PH1-worktrees.md`) are built and merged (L146: Phase 2 starts on its approved plan) | **Decision rows**: L149 (this plan and its rulings), L41 (roles), L98 and E-08 (Firebase Auth), L109 (sign-in providers), L121 and DC28 (multi-tenant admins), L128 (two lints deferred to Phase 2), L146 (H2: a minimal FieldSpec in Phase 2), L148 (Phase 1 closed) | **Spec**: none. The standard's Appendix C Phase 2 is the specification, as Appendix C Phase 1 was for `plan/PH1-rails.md` (L123), read at Engineering Standards v1.0 lines 1285–1293 with the items it names | **Approver**: Genesis Perez, product owner

## 1. What Phase 2 delivers

The standard (Appendix C, Phase 2, `Engineering Standards.html:1287`):

> **In:** §3.3 authentication. §3.4 three-layer authorization (A.2). §3.5 multi-tenancy. §3.6 audit trail (A.3). §3.2 rate limiting, both kinds. §3.7 input validation. A.4 secret redaction. §4.4 client auth and session. §4.5 routing and guards. From §5: user, role, and permission maintenance plus the menu.

> **Not in:** domain tables. Reference tables (phase 3).

> **Gate:** the §6 security release gate passes in full, on a system that does nothing yet.

Gabay adds to the gate: "including the public API's read-only and published-only guarantees" (`plan.html:1296`). It also adds H2 (L146): the maintenance screens are built on a minimal `FieldSpec` and list scaffold.

**Not in Phase 2:** any domain feature (P0-01 onward); reference and lookup tables; the `/api/lookups/:name` controller (Phase 3); the shopper-facing sign-in screens (P0-10); Firebase deploys (L109: local first).

## 2. What exists today (inventory, 2026-10-09)

- **API** (`functions/src/app.js:75–89`): helmet, cors, json limit, requestId, actorContext (actor `null`), an empty audit slot (`:82`), `/api` no-store, an empty rate-limit slot (`:84`), `GET /api/health`, notFound, errorHandler (`{ error }`, no driver text).
  - `firebase-admin` 14.5.0 and `express-rate-limit` 8.7.1 are pinned but unused.
  - `utils/requestContext.js` has the `{userId, tenantId}` store.
  - `config/settings.js` already reads `X-Tenant-Id`.
- **Schema 0.14** (signed): `Tenant`, `AppUser` (`FirebaseUid`, `IsActive`, no TenantId, DC28), `Role` (4 seeded), `UserRole` (TenantId NULL only for platform roles), `PermissionRoute`, `RolePermission`, `UserPermission` (replaces the merged role row), `UserVenueGrant`, `GlobalSetting`, `AuditLog` (with `ActingAsTenantId`), `ShopperAccount`.
  - No menu, session or rate-limit tables.
  - **No `PermissionRoute`, `RolePermission` or `UserPermission` rows exist**; only the roles are seeded (`db/seeds/lib/lookups.js:68–73`).
- **App:** `ApiClient` already sends `X-Tenant-Id` and `Bearer`. Its 401 handler freezes the future and skips no paths. The Riverpod slots `sessionTokenProvider`, `activeTenantIdProvider` and `unauthenticatedHandlerProvider` are null or no-op. `go_router` has no guard. `app/lib/shared/forms/` does not exist. **No `firebase_core` or `firebase_auth` package.**
- **Seed:** six `@gabay.test` accounts in the Auth emulator (`demo-gabay`), with `UserRole` and `UserVenueGrant` rows (`db/seeds/lib/accounts.js`).

## 3. Slices

Each slice ends as Phase 1's did: tests first, its evidence pasted into `phase-reports/phase-2/P2-S<n>.md`, then dod-reviewer, then your go before its pull request. Coders work in their own working copies (`plan/PH1-worktrees.md`, built first).

| Slice | What | Who | Depends on |
|---|---|---|---|
| P2-S1 | **Authentication.** Verify the Firebase ID token with `firebase-admin` (revocation checked; the Auth emulator in development). Map the UID to `AppUser`; refuse an inactive user; check the token age against `GlobalSetting` `auth.idTokenMaxAgeS`. Fill actorContext. `GET /api/me` returns the user, their tenants and their merged permissions. | api-coder | — |
| P2-S2 | **Tenant context.** `X-Tenant-Id` is accepted only if the user has a `UserRole` in that tenant (L121, DC28). SUPERADMIN acts as any tenant, and every act-as is audited (`ActingAsTenantId`). Controllers read `req.tenantCompanyID`. Venue scope comes from `UserVenueGrant`. | api-coder | S1 |
| P2-S3 | **Authorization** (§3.4, A.2; Q6, Q8). A role guard, then `requirePermission(routes[], action)`: route × CRUD; role rows OR-ed; a `UserPermission` row replaces the merged role row; SUPERADMIN bypass; a 30 s cache cleared on every grant write; a three-valued verdict; fail-closed 503 when the database is down. The first migration, `db/migrations/0001_…`, drops the duplicate `UserRole` index (Q13) and seeds the `PermissionRoute` rows and the default `RolePermission` grants for Phase 2's own routes (the L41 matrix). | api-coder | S2 |
| P2-S4 | **Audit trail and redaction** (§3.6, A.3, A.4). One shared `redactSecrets` module (EXACT, STEMS, `NEVER_SECRET` wins). The audit middleware snapshots before handlers and writes on `res.on('finish')`, fire-and-forget. It covers POST, PUT and DELETE; anonymous 404s are dropped; IPs are normalised; the payload is capped at 4,000 characters with a marker. | api-coder | S1 |
| P2-S5 | **Rate limiting** (§3.2). A global limiter on `/api` (`RATE_LIMIT_PER_MIN`, default 1,200), an auth limiter (target: open question Q3), and a `RATE_LIMIT=off` kill switch. In memory, valid only while `maxInstances = 1` (Blueprint §2.6). | api-coder | S1 |
| P2-S6 | **Validation** (§3.7). zod middleware on every route boundary; allow-list maps for sort keys; the escalation guards (only SUPERADMIN grants SUPERADMIN; a delegated grant cannot raise its own rights). | api-coder | S3 |
| P2-S7 | **The admin API.** `/api/me`; users (list, create by invitation (Q4), update, deactivate); roles and their grants; per-user overrides; venue grants; a read-only audit log; settings (read and update the Phase 2 keys). Self-service routes are declared above `/:id` routes. Each route has its `PermissionRoute` row, tests and e2e cases. | api-coder | S3–S6 |
| P2-S8 | **Two lints** (L128). `route-guard-order` (the order ruled in Q6) and `raw-error-text` (no driver text, stack or schema names reach a response). | api-coder | S3 |
| P2-S9 | **Minimal form and list machinery (H2).** In `app/lib/shared/forms/`: `FieldSpec` in the exact shape the `schema-forms` linter parses (`table`, `name`, `kind: ColKind.x`, `required`, `maxLength`, `scale`, `readOnly`), one resolver, and `ModuleListScaffold<T>` (search debounce, paging, the four states). **Bounded:** only the field kinds and list features the S11 screens use, listed in the slice's report; everything else stays in Phase 3. | flutter-coder | — (runs alongside S1–S8) |
| P2-S10 | **Client session and routing** (§4.4, §4.5). `firebase_core` and `firebase_auth` (Q10) for the admin page and the app's admin side. Sign-in, session restore before the first frame, the token and tenant providers, the 401 path, and the distinction between manual sign-out and expiry (expiry keeps `?from=`). `go_router`: one `redirect` (sign-in, flags, then CRUD from the URL tail, failing to `/unauthorized`), `refreshListenable`, one `ShellRoute`, a `RouteObserver`. The menu shows only what the user's permissions allow (Q9). There is a tenant and venue switcher. | flutter-coder | S9; S1–S3 for live tests |
| P2-S11 | **The maintenance screens.** Users, role grants (route × CRUD grid), per-user overrides, venue grants, the audit viewer, and settings, all on S9's machinery. Wording in ARB; changelog entries; screenshots. | flutter-coder | S7, S9, S10 |
| P2-S12 | **End-to-end and manuals.** e2e cases for auth, RBAC and tenant isolation, including cross-tenant reads and writes refused with every role. Covers `docs/testing/E2E_Test_Cases_Manual.md`, the frontend manual and the smoke guide. | test-verifier | S7, S11 |
| P2-S13 | **The gate.** The §6 security gate in full (§5 below), in `phase-reports/phase-2.md`, which you sign. | main session | all |

## 4. DESIGN CHOICES (for your approval with this plan)

| # | Choice | Alternative, and why it was passed over |
|---|---|---|
| P2-DC1 | Thirteen slices, the backend (S1–S8) beside the client form machinery (S9) from day one | Strict order, client after backend: simpler, but slower, and H2 was ruled to overlap them (L146) |
| P2-DC2 | `PermissionRoute` and default grants seeded by migration `0001` | Rows in the seed script: but the seed is test data and is reset; permissions must exist in every database, including a deployed one |
| P2-DC3 | The API returns permissions from `/api/me`, not in token claims | Firebase custom claims: they'd duplicate the database, go stale until the token refreshes, and Gabay keeps roles in the database (E-08) |
| P2-DC4 | `auth.idTokenMaxAgeS` stored as a `GlobalSetting` key with a default | An env value: the Blueprint already names it a setting (`GABAY_MASTER_BLUEPRINT.md:190`) |

## 5. The §6 gate, item by item (what will be shown)

| §6 item | In Phase 2 |
|---|---|
| 1 TLS, HSTS, trust proxy | TLS ends at Google's front end (`PH1-rails.md` §6). Shown: HSTS through helmet; the trust-proxy hop count tested |
| 2 Both limiters active, the auth limiter counting failures only | Tested (target per Q3) |
| 3 Secret guard; no `.env`; encryption key | Hook and CI guard (Phase 1). The encryption key: Q7 |
| 4 Audit attributes correctly; redaction of `password`, `newPassword`, `changePassword` (the flag must survive) | Tested on the shared module and through a route |
| 5 Permission guard fail-closed | The database killed mid-session gives 503, not 200 or 403 |
| 6 No self-escalation | Tested with every role |
| 7 Uploads | N/A: no upload route in Phase 2 (stated) |
| 8 SQL by reachability | The `sql-interpolation` and `tenant-predicate` linters, plus review |
| 9 No driver text in errors | The new `raw-error-text` lint plus tests |
| 10 Every gate gates | Shown by a deliberately failing check, as in Phase 1 |
| 11 Webhook HMAC | N/A until the live position engine (`plan.html:1731`) |
| 12 Production database access written down | A section in `docs/ops/DEPLOYMENT_RUNBOOK.md` |
| Gabay: public API read-only and published-only | No public route exists yet. Shown: the mount order puts `/api/public/*` first and GET-only, with a test that a non-GET there is refused |

## 6. Dependencies (C8)

- **Flutter:** `firebase_core` and `firebase_auth`. Versions are read from pub.dev when S10 starts (never from memory). They get a Blueprint Part 1 pin and an EXCEPTIONS entry for your approval (Q10).
- **Server:** none new (`firebase-admin`, `express-rate-limit` and `zod` are pinned).

## 7. Rulings on the open questions (L149, 2026-10-09, the product owner, one by one; each as recommended)

Each question is kept as it was put, with its ruling first.

1. **Ruled: Gabay's rule.** Every request names its tenant in `X-Tenant-Id`, accepted only with a `UserRole` there; SUPERADMIN may name any tenant, audited. `plan.html:1289` is corrected. **Where the tenant comes from.**
   - The standard §3.5 (`:272`) says the token claim, with a header override for superusers only.
   - Gabay ruled every request names its tenant in `X-Tenant-Id`, checked against the user's `UserRole` rows (invariant 13, `GABAY_MASTER_BLUEPRINT.md:241`; L121, DC28).
   - `plan.html:1289` still says "a tenant header override honoured for superusers only".
   - *Recommended:* keep Gabay's rule (already ruled), and correct line 1289's text in the same L-row.
2. **Ruled: dropped from Phase 2;** Firebase's brute-force protection stands in for lockout; `plan.html:1288` and §12 item 10's line are corrected. **Lockout and single-session.**
   - E-08 gives them to Firebase Auth and retires the columns.
   - `plan.html:1288` and §12 item 10 (`:1736`) still list a GlobalSettings screen for "the lockout threshold and the single-session toggle".
   - *Recommended:* drop both from Phase 2 and correct those lines. Firebase's brute-force protection stands in for lockout.
   - Alternative: build "sign out everywhere" through Firebase's `revokeRefreshTokens`, as a later entry.
3. **Ruled: count failed token checks** (401s per IP, 15 minutes, failures only). **The auth limiter has no login route** (Firebase signs in without calling the API).
   - *Recommended:* count failed token verifications (401s) per IP over 15 minutes, failures only, which meets gate item 2's wording.
   - Alternative: a limiter on `/api/me`, the first call after sign-in.
4. **Ruled: a password-setup link;** Gabay never holds a password. **Passwords for new admins** (§5 `:488`: a temporary password returned once, then a forced change).
   - *Recommended:* the admin API creates the Firebase user with no password and returns a password-setup link (Firebase's password-reset link; in development the emulator shows it). Gabay never holds a password. The `changePassword` redaction test is kept anyway.
   - Alternative: a temporary password through the Admin SDK, with "must change" held in Gabay's database. That brings back a column E-08 retired.
5. **Ruled: no logout timer;** expiry is a failed refresh or a 401, on the expiry path with `?from=`. **Token lifetime on the client** (§4.4: parse `exp`, a logout timer firing about 2 s early).
   - Firebase ID tokens last about an hour and refresh themselves (RECALLED; checked against Firebase's docs before S10).
   - *Recommended:* no logout timer. Expiry means a refresh that fails, or a 401 from the API (revoked or disabled), and takes the expiry path with `?from=`.
6. **Ruled: `auth → tenantContext → role guard → permission guard → validate → handler`;** the S8 lint enforces it; the pipeline's §5.1 text is corrected. **Guard order.**
   - The Blueprint says `auth → tenantContext → authorize → validate` (`:177`).
   - The pipeline's §5.1 lint text says "role → permission → tenant scope → validation".
   - *Recommended:* `auth → tenantContext → role guard → permission guard → validate → handler`, because a user's role and permissions depend on the tenant named. The S8 lint enforces this order; the pipeline text is corrected.
7. **Ruled: N/A in Phase 2,** stated in the gate report. **Gate item 3's encryption key.**
   - The only encrypted column is `Sentinel.HmacSecretEnc` (a P0 feature).
   - *Recommended:* stated N/A in Phase 2, and checked when that column is first written.
8. **Ruled: SUPERADMIN only.** **Who bypasses permissions.** The standard's example bypasses its admin role.
   - *Recommended:* SUPERADMIN only; MALL_ADMIN goes through its grants.
9. **Ruled: from permissions;** no schema change. **The menu.** There is no menu table in the signed schema.
   - *Recommended:* the client's route table names each menu item's `PermissionRoute` key, and an item shows only when the user can Read it. No schema change.
   - Alternative: a `MenuItem` table, which is a schema change.
10. **Ruled: a new entry E-19,** requested when S10 starts with versions read from pub.dev then; you approve it then. **Client Firebase packages.**
    - `firebase_core` and `firebase_auth` aren't named by §1. E-08 approved Firebase Auth as a service, and E-09 lists only the server libraries.
    - *Recommended:* one new entry, E-19, for your approval when S10 starts. Shoppers' Google and Apple sign-in packages wait for P0-10.
11. **Ruled: email and password only** for admin accounts. **How admins sign in.** L109 rules shoppers' methods only.
    - *Recommended:* email and password only for admin accounts (created by an admin, Q4).
    - Alternative: Google too.
12. **Ruled: the verifier resolves either identity now; the shopper routes come with P0-10.** **Shopper identity in Phase 2.** `plan.html:1293` says it is built "on the same §3.3 machinery" in Phase 2, but the feature ships with P0-10.
    - *Recommended:* S1's verifier can resolve either identity (`AppUser` or `ShopperAccount`). The shopper routes (sign-in record, deletion) come with P0-10.
13. **Ruled: fixed in migration `0001`** (S3). The duplicate `UserRole` index is dropped in the migration and in `schema.sql`, which then has 132 indexes, matching its header. So `db/tools/setup-db.js`'s expected count (`:22`), `INSTALL.md` A.1, the smoke guide's bootstrap check and `db/SCHEMA_READING_GUIDE.md` move from 133 to 132 in the same change (rule 4; sync table). **Two schema details found by the inventory.**
    - The header says 132 indexes, while `setup-db` expects and gets 133.
    - `UserRole` has two identical unique indexes (`db/schema.sql:296`, `:298`).
    - *Recommended:* in S3's migration `0001`, drop the duplicate and correct the header with `schema.sql`, per rule 4. This is a change to the signed schema, so it needs your yes.
    - Alternative: leave both, and note it in `SCHEMA_READING_GUIDE.md`.

## 7a. Rulings from the S1 and S9 reviews (L151, 2026-10-09, the product owner, each as recommended)

- **The emulator guard (S1).** `FIREBASE_AUTH_EMULATOR_HOST` is refused unless the environment explicitly says `NODE_ENV=development` or `test`; an unset `NODE_ENV` does not count (emulator mode accepts unsigned tokens).
- **The token age (S1).** `auth.idTokenMaxAgeS` measures time since sign-in (`now − auth_time`), default 28,800 s (8 hours, the standard §3.3's session length). A token without `auth_time` is refused. The 401 is the client's sign-out (Q5).
- **Test data (S1).** API tests may write real tables only inside an always-rolled-back transaction (WORKING_AGREEMENT §5).
- **Per-user overrides (S6, S7).** `UserPermission` has no tenant, so an override applies in every tenant the user belongs to. It may be written only by SUPERADMIN or by an admin who is MALL_ADMIN in every tenant that user belongs to; enforced and tested in S6 and S7. No schema change.
- **The FK picker (S9).** The async server-search picker (standard §4.10, P0) is built in S9; there is no load-all dropdown. Its options come from a fetch function the ViewModel supplies (the `/api/lookups/:name` controller stays in Phase 3).
- **`UserRole` (S9, S11).** One row per role-and-tenant choice, each a single selection.

## 8. Scale

The standard and the PRD state no admin-side scale target. The pilot has one mall operator, a handful of admins (`GABAY_PRD.md` personas), and one function instance (`maxInstances = 1`). An in-memory permission cache and rate limiter are therefore valid (Blueprint §2.6) and are written down as such. A move past one instance is a pipeline entry, not a quiet change.

## 9. Risks

- **H2 creep:** S9 grows into Phase 3's full machinery. Held by S9's listed bound.
- **Firebase emulator gaps** (revocation, password-reset links): RECALLED; checked when S1 and S7 start, and any gap stated.
- **Two coders at once:** depends on the working copies (`plan/PH1-worktrees.md`) being built first.

## 10. Done means

- Every slice's checks pasted with exit codes, and `npm run verify` ending ALL GREEN.
- The §6 gate shown item by item.
- The e2e suite covers auth, RBAC and tenant isolation.
- The companion-file sync table walked for every route and screen.
- `phase-reports/phase-2.md`, signed by you.
