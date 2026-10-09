# FF-0 (server half) — the development stub and the read-only lookups: slice report

> **Plan**: `plan/FF0-dev-stub-lookups.md` 1.0 (APPROVED, L154), §2, §3, §5 (server tests), §6 | **Parent**: `plan/PH4-feature-first.md` 1.0 (E-20, L153) | **Built by**: api-coder (Sonnet 5.5), in `Gabay-wt\api-coder`, branch `ff0-server` | **Reviewed by**: not yet (dod-reviewer is next, plan §7) | **Client half**: flutter-coder, separate

## 1. What was built

- **One shared guard constant** (`functions/src/config/index.js`). `DEV_ONLY_ENVS = ['development', 'test']` replaces S1's private `EMULATOR_ALLOWED_ENVS`. `parseConfig` computes `config.devOnlyAllowed` from the RAW `NODE_ENV` (unset and empty are false). The Auth-emulator guard and the stub both read it. S1's config tests pass unchanged.
- **The setting** `DEV_STUB_USER_EMAIL` (`config.devStub.userEmail`, default `malladmin@gabay.test`, validated as an email), in `.env.example` and `INSTALL.md`.
- **The stub** (`functions/src/middleware/devStub.js`).
  - `createDevStub` throws unless `config.devOnlyAllowed`, so `createApp` (and the Function) will not start with `NODE_ENV` unset, empty or production.
  - It logs `DEV STUB ACTIVE (E-20): admin routes run without sign-in` once, at creation.
  - Per request it loads the AppUser named by `DEV_STUB_USER_EMAIL` through S1's identity store (new method `findAdminByEmail`), then the user's tenants from the `UserRole` rows (S1's access store, no new SQL).
  - Tenant: `X-Tenant-Id` if the user holds a `UserRole` row there, else 403 `{"error":"This account has no access to that tenant"}`; with no header, the user's first tenant by `Tenant.Code`.
  - It sets `req.user` (`{kind, userId, email, displayName, uid}`, the shape `auth` builds, no tenant), `req.tenantCompanyID`, `req.log` bindings, and `runWithActor(userId, next, { tenantId })`.
  - No permission check (waived items 3 and 4).
- **The wiring** (`routes/api.js`, `app.js`). An "admin features (E-20)" group mounts `router.use('/lookups', devStub, lookupRoutes(lookups))`, per path, so an unknown path stays a plain 404 and never reaches the stub. `/api/me` keeps S1's real `auth → requireAdminUser`.
- **The lookups** (`services/lookup.service.js`, `routes/lookups.js`). Contract in §6 below.

## 2. Evidence

**Tests first.** The four new test files were written before any code. First run, before the build (`node --test` on the four files):

```
# tests 23
# pass 3
# fail 20
(test\devStub.test.js: Error: Cannot find module '../src/middleware/devStub', the file did not load)
```

The 3 that passed were the lookups' 404 tests, which pass on an unrouted path. After the build all of them pass.

**Mutation checks** on `lookup.service.js` (each reverted afterwards):

| Mutation | Result |
|---|---|
| drop `AND IsActive` from the list | `lookups: inactive rows ...` fails |
| search pattern left unescaped (`%${search}%`) | `lookups: search ... match literally` fails |
| drop `OR TenantId IS NULL` from the list | the global-lookup test and the platform-row test fail |
| by-id predicate widened to other tenants' rows | `lookups: by id never returns another tenant's row` fails |
| remove `TenantId = $1` from a `runPaged` where | the `tenant-predicate` lint reports `lookup.service.js:45 ... has no TenantId = $n predicate` |

**`npm run verify`** (in `Gabay-wt\api-coder`, `GABAY_VERIFY_OWNER=api-coder`), exit 0:

```
ok   node-version         (0.0 s)
ok   node-check           (2.2 s)
ok   structural-linters   (0.6 s)
ok   linter-tests         (3.3 s)
ok   tools-tests          (95.4 s)
ok   eslint               (2.3 s)
ok   prettier             (2.9 s)
ok   schema-run-1         (3.4 s)
ok   schema-run-2         (2.6 s)
ok   api-tests            (8.6 s)
ok   db-tools-tests       (1.0 s)
ok   seed                 (12.0 s)
ok   functions-health     (9.2 s)
ok   flutter-analyze      (6.6 s)
ok   flutter-test         (20.3 s)

ALL GREEN   (173.0 s)
```

`npm --prefix functions test`: 192 tests, 192 pass, 0 fail, 0 skipped. `lint:structural`: 10 linters, 0 violations, no suppression added.

**The verify order.** `api-tests` runs after the schema is recreated and before the seed, so the database has no seeded rows then. A first verify run failed two lookups tests that assumed seeded platform rows. The tests were fixed (they now write their own platform rows inside the rolled-back transaction), not the code; the localhost check of the seeded values is manual cases FF0.1 to FF0.5.

**Existing tests:** two changed, by the owner's ruling L155 (see §3 and §8); no other. S1's `app.test.js` counts `warn` log lines on a normal start, which is why the stub's startup line is `info` (DESIGN CHOICE 6).

## 3. Tests added

| File | What it pins |
|---|---|
| `functions/test/config.devOnly.test.js` | the shared constant; `devOnlyAllowed` for unset, empty, production, development, test; the emulator guard and the stub guard agree; `DEV_STUB_USER_EMAIL` default, empty, override, malformed |
| `functions/test/auth.identityStore.byEmail.test.js` | `findAdminByEmail`: case-insensitive, inactive flagged, shopper/unknown/non-string are null |
| `functions/test/devStub.test.js` | refused for unset/empty/production, accepted for development/test; startup line once; fields filled across an async hop and a database hop; header held → used; not held, malformed, `0`, huge → 403; blank header → default; query-string tenant ignored; no header → first tenant by Code whatever the grant order; missing, inactive and tenant-less user → 500 naming the fix; no email in the log |
| `functions/test/lookups.test.js` | unknown names (including `constructor`, `__proto__`, table names) 404; GET only; no token needed while `/api/me` still 401; the exact row and envelope for all three names; platform plus own rows, never another tenant's; the tenant is the stub's, not the request's; inactive out of the list, in by id; by id never another tenant's, bad ids 404; an id read from its own table; search is case-insensitive and `'`, `%`, `_`, `\` are literal; blank search is no search; paging cap at 200 and no overlap across 210 rows; order `SortOrder`, `Label` whatever `sortBy` or `sortOrder` is sent; a platform row served for each name |

All database writes are inside the always-rolled-back transaction (WORKING_AGREEMENT §5, L151).

**Existing tests changed (the owner's ruling L155, C1), each a one-line update:**

- `tools/test/workflow-steps.js`: the pinned `run` of the e2e step "Write .env from throwaway values" gains `echo "NODE_ENV=development"` as its first line.
- `tools/test/workflow-snapshots/e2e.yml.snap`: the same line is added to the snapshot.

Reason: the stub refuses to exist unless `NODE_ENV` is written explicitly, so CI's `.env` must write it (`.env.example` has it). Failing first: with the two tests updated and `e2e.yml` not yet, `npm run tools:test` gave `# tests 414, # pass 408, # fail 4` (the e2e step rule, the snapshot cases). Then `e2e.yml` was changed and it gave `# pass 412, # fail 0, # skipped 2`. The comment explaining the line sits above the step in the workflow, because a comment inside the `run: |` block is part of the pinned run text.

## 4. DESIGN CHOICES (api-coder; each with its alternative)

1. **A missing, inactive or tenant-less stub user is a 500 on the request** (message names `DEV_STUB_USER_EMAIL`, exposed so the developer sees it), not a startup failure. *Alternative:* check once at startup; `createApp` is synchronous and `index.js` builds the app lazily, so that would need an async start for a development-only convenience.
2. **The user is loaded per request**, so a changed seed or setting takes effect without a restart. *Alternative:* load once and cache; it saves about four small queries per request.
3. **The tenants come from S1's `accessStore.loadForUser(...).roles`**, with no new SQL, so there is no new `// tenant-scope:` suppression. The cost is that it also reads permission rows the stub ignores. *Alternative:* a narrow tenants query on `UserRole` joined to `Tenant`, which `tenant-predicate` would make an annotated suppression.
4. **Inactive tenants are not filtered** (the plan says "first tenant by `Tenant.Code`" and "a tenant where that user has a `UserRole` row"). S2 (R1) decides what an inactive tenant does. *Alternative:* skip inactive tenants in the default and refuse them in the header.
5. **Each lookups entry carries its own literal SQL** (three near-identical entries), so no table or id column is interpolated and neither `sql-interpolation` nor `tenant-predicate` needs a suppression (`runPaged` must see literal `from` and `where` at the call site). *Alternative:* one generic function with the table from the map, which needs `// sql-identifiers:` and `// tenant-scope:` annotations.
6. **The stub's startup line is `info`, not `warn`.** S1's `app.test.js` asserts no `warn` line on a normal start, and the plan forbids changing it. The default `LOG_LEVEL` shows `info`. *Alternative:* `warn`, with that test edited and named in the plan.
7. **`sortBy` and `sortOrder` are not read** by the lookups (the order is fixed by the plan); only `page`, `pageSize` and `search` are handed to `parsePaging`. The tie-breaker is the output column `id`.
8. **A malformed or oversize id is 404**, not 400 (the same answer as "no such row", so the route reveals nothing).
9. **`req.user` carries `uid`** (the Firebase UID of the stub's user), as the real `auth` does, so no handler written now breaks at R1.

## 5. Waivers and the definition of done (FEATURE_PIPELINE §5)

- `Waived: 3 (guard order) — the dev stub stands in; R1–R3, checked by R7's route-guard-order lint`
- `Waived: 4 (permission and menu rows) — R2`
- `Waived: 9 (automated e2e) — R12`. The manual cases FF0.1 to FF0.18 are written now.

| Item | Status |
|---|---|
| 1 Schema and migration | N/A: no schema change (the three tables and their `UX_*_Code` indexes exist; the schema comments already say "serves: /api/lookups/:name") |
| 2 Seed | N/A: the three tables are seeded already (`db/seeds/lib/lookups.js`) |
| 5–8, 13 | N/A for the server half: no screen or form (flutter-coder's half) |
| 6 Notifications | N/A |
| 10 Manuals and smoke guide | API manual: cases FF0.1 to FF0.18 added. Frontend manual and smoke guide: the banner rows are flutter-coder's half |
| 11 Changelog | N/A for the server half (no app change); the banner's entry is flutter-coder's |
| 12 Sync table | Walked below |
| 14 Enumerable sets | No new set. The three existing sets get their allow-list entries. Their maintenance screen, permission routes and menu entry are Phase 3 §3.19 (R11) per `PH4-feature-first.md` §3 and §6; for dod-reviewer to confirm that item 14 is met by that |
| 15 Inactive-lookup case | The server half is tested (an inactive row is out of the list and returned by id, for the tenant's and a platform row). The "save a historical record with the value" part needs a form: it is the client picker test and FF-1's first form |
| G1 Traceability | §7 |
| G2, G3 | N/A (no app change) |
| G4 | No behaviour differs from the PRD or Blueprint; Blueprint 4.15 is brought to "as built" in 0.28 |

**The sync table, row by row:**

| When this changes | Done |
|---|---|
| `db/schema.sql` | not changed |
| An API route | tests (§3); the API manual (FF0.1 to FF0.18); Blueprint 0.28, Part 4 anchor 4.15 and the two stub notes; the permission and menu seed rows are waived to R2; the e2e suite waived to R12; Part 1's API conventions did not move |
| A screen or its wording | N/A for this half |
| A dependency | none added |
| A setting, limit or option list | `DEV_STUB_USER_EMAIL`: `.env.example`, `INSTALL.md`, Blueprint 4.15; no `GlobalSetting` row (it is an env value); the option lists come from the seeded tables |
| An owner ruling | L154 is recorded by the main session in `plan.html`; nothing new ruled here |
| A command or check | none added. CI: `.github/workflows/e2e.yml` writes `NODE_ENV=development` into its `.env` (L155), with the two pinned tools tests updated (§3) |
| A pipeline entry's state | not DONE: the client half and review remain; `FEATURE_PIPELINE.md` is untouched |
| A deploy or an incident | none |

The retrofit ledger (`plan/PH4-feature-first.md` §7) has two new rows: `GET /api/lookups/:name` and `GET /api/lookups/:name/:id`, each stub, no permission row, no menu row, audit n/a (read-only), no e2e.

## 6. The contract for the client half (flutter-coder)

Base: `/api`. No token and no tenant header are needed in FF-0 (the stub); a client may send `X-Tenant-Id: <id>` to act for another tenant the user holds (FF-0's client sends none). Every response is `application/json`, `Cache-Control: no-store`.

**`GET /api/lookups/:name?search=&page=&pageSize=`**, `:name` is `building-types`, `amenity-types` or `transit-types`.

```json
{
  "items": [
    { "id": 1, "code": "MAIN", "label": "Main building", "isActive": true }
  ],
  "totalCount": 7,
  "page": 1,
  "pageSize": 25
}
```

- Only active rows of the request's tenant and the platform. Ordered by `SortOrder`, then `Label`, then `id`. `sortBy` and `sortOrder` are ignored.
- `page` and `pageSize` are lenient: a bad or missing value falls back to 1 and 25; `pageSize` is capped at 200 and the envelope returns the capped value. `search` is trimmed, cut to 100 characters, and a blank search is no search; it is a case-insensitive "contains" on the label (`%`, `_` and `\` are literal).

**`GET /api/lookups/:name/:id`** (`:id` digits only).

```json
{ "id": 1, "code": "MAIN", "label": "Main building", "isActive": true }
```

An inactive row is returned with `"isActive": false` (for the picker's `currentOption`). A row of another tenant is 404.

**Errors** (the one API shape, `{ "error": "<message>" }`):

| Status | Body | When |
|---|---|---|
| 404 | `{"error":"Not found"}` | an unknown name; a malformed, unknown or other-tenant id; any method other than GET |
| 403 | `{"error":"This account has no access to that tenant"}` | `X-Tenant-Id` names a tenant the stub user does not hold (or is not a number) |
| 500 | `{"error":"Development stub (E-20): the user named by DEV_STUB_USER_EMAIL was not found. Set it in .env to a seeded admin account."}` (or `... is not active ...`, `... has no tenant role ...`) | the stub's user is missing, inactive or has no tenant |
| 500 | `{"error":"Internal server error"}` | anything unexpected |
| 503 | `{"error":"Database unavailable"}` | the database cannot be reached |

## 7. Traceability (plan §5, server part)

| Criterion | Test file | Result |
|---|---|---|
| Stub refused for unset, empty, production | `devStub.test.js`; `config.devOnly.test.js` | pass |
| Stub accepted for development and test | `devStub.test.js`; `config.devOnly.test.js` | pass |
| Fills `req.user`, `req.tenantCompanyID` and the actor across an async hop | `devStub.test.js` | pass |
| Header names a held tenant: used | `devStub.test.js` | pass |
| Header names a tenant not held: 403 | `devStub.test.js` | pass |
| No header: the default tenant | `devStub.test.js` | pass |
| Startup line logged once | `devStub.test.js` | pass |
| Lookups: unknown name 404 | `lookups.test.js` | pass |
| Platform plus own rows, never another tenant's | `lookups.test.js` | pass |
| Inactive left out of the list, returned by id | `lookups.test.js` | pass |
| Search parameterized (`'`, `%` literal) | `lookups.test.js` | pass |
| Paging hits its cap | `lookups.test.js` | pass |
| Order `SortOrder`, then `Label` | `lookups.test.js` | pass |

## 8. Open, outside this slice

- **CI's `functions-health` (closed by the owner's ruling L155).** The stub refuses to exist unless `NODE_ENV` is written explicitly, and `e2e.yml` wrote a `.env` with no `NODE_ENV`. Run here with `NODE_ENV` removed from the copy's `.env`: `UNHEALTHY: HTTP 500 null`, `1 FAILED: functions-health`. Fixed in a second commit: `echo "NODE_ENV=development"` in the `.env` step of `e2e.yml`, plus the two pinned tools tests (§3).
- Pre-existing and unchanged: S1's `identityStore.findByFirebaseUid` and everything else in `auth/`.
