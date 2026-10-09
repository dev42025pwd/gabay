# FF0-dev-stub-lookups — FF-0: the development stub and the read-only lookups (E-20)

> **Version**: 1.2 | **Date**: 2026-10-09 | **Status**: APPROVED by Genesis Perez, 2026-10-09 (L154), with §8's three questions ruled, all as recommended; 1.1 adds the server review's rulings (L155, §9); 1.2 names the client half's owner-ruled existing-test changes (L163) | **Parent**: `plan/PH4-feature-first.md` 1.0 §3 (L153, EXCEPTIONS E-20) | **Spec**: none. FF-0 is setup work that the parent plan defines, as Phase 2's slices are; the P0 entries from FF-1 on each get their own intent, spec and plan | **Approver**: Genesis Perez, product owner

## 1. What FF-0 delivers

Two things the feature slices need before P0-01 (FF-1) can start, plus one visible marker:

1. **The development stub** (api-coder). Admin routes run behind it until the retrofit's R1. It fills exactly what the real chain will fill, so R1 replaces one middleware instead of editing every route (L153, ruling 1).
2. **The read-only lookups route** (api-coder). This is `GET /api/lookups/:name`, pulled forward from Phase 3, so P0-01's dropdowns come from tables (rule 5; L153, ruling 2).
3. **The admin client's side** (flutter-coder):
   - a fetch function that S9's picker can use over that route;
   - a "Development build: no sign-in" banner on the admin page, so every screenshot shows the state.

## 2. The stub (`functions/src/middleware/devStub.js`)

**Refused at load** unless the raw environment says `NODE_ENV=development` or `NODE_ENV=test`. This is the same rule and the same reason as S1's emulator guard (L151): an unset `NODE_ENV` does not count.
- **DESIGN CHOICE:** the allowed list moves into one shared config constant used by both guards. This is its second use, so it is extracted (C2).
- **Alternative:** a second copy in the stub.

**What it does per request:**
- **`req.user`:** it loads one seeded admin, `AppUser` by email, through S1's identity store. The default is the account `DEV_STUB_USER_EMAIL` names in `.env`, and `.env.example` documents it (open question 1).
- **`req.tenantCompanyID`:**
  - If `X-Tenant-Id` is present, it must name a tenant where that user has a `UserRole` row; otherwise the request gets 403 with the standard error shape.
  - Without the header, it uses the user's first tenant by `Tenant.Code`.
  - This is a small copy of S2's rule; R1 replaces it with S2 itself.
  - **DESIGN CHOICE.** *Alternative:* always the Demo Malls tenant, which would make the penthouse's tenant unreachable until R1.
- **The actor context:** `runWithActor(userId, next, { tenantId })`, so `CreatedBy` and `UpdatedBy` are stamped and `getTenantId()` works in deep services.
- **No permission check:** that is the waived item 3, closed by R2 and R3.

**Where it is mounted:** `routes/api.js` gains an "admin features (E-20)" group, and every FF route is mounted there behind the stub. `/api/me` keeps S1's real `auth`.

**A startup line:** `DEV STUB ACTIVE (E-20): admin routes run without sign-in` in the server log.

**Removal:** R1 deletes the file and swaps the group's middleware for `auth → tenantContext`. Its tests are deleted with it; the plan names that change now.

## 3. The lookups route (`functions/src/routes/lookups.js`, `services/lookup.service.js`)

- **`GET /api/lookups/:name?search=&page=&pageSize=`**
  - It returns active rows for the request's tenant plus the platform rows: `(TenantId = $1 OR TenantId IS NULL) AND IsActive`, the Blueprint's global-lookup trap.
  - It is ordered by `SortOrder`, then `Label`.
  - It is paged by `runPaged`, with the standard's envelope and cap.
  - `search` matches `Label` with a parameterized `ILIKE`.
  - **The row:** `{ id, code, label, isActive }`.
- **`GET /api/lookups/:name/:id`** returns one row, even an inactive one, for the picker's `currentOption` (§4.10 inactive-value retention; S9's open item). It gives 404 if the row belongs to another tenant.
- **The allow-list:** a frozen map from the name in the URL to a table and its id column. An unknown name is 404. No request value reaches SQL except as a bound parameter (rule 3; `sql-interpolation`). The tenant comes only from `req.tenantCompanyID` (rule 2; `tenant-predicate`).
- **Names in FF-0:** the three P0-01 needs, `building-types`, `amenity-types` and `transit-types` (open question 3). Each later slice adds its own name in one line, for example `connector-types` in FF-10.
- **Not in FF-0** (Phase 3, R11): tenant-specific values maintained on a screen, the lookup maintenance screen, cascading lookups, `dependsOn`.

## 4. The admin client

- **`lookupFetcher(name)`** in `app/lib/shared/forms/`:
  - It returns a `LookupFetcher` for S9's `LookupPickerField`, over `ApiClient`, mapping rows to `SelectOption`.
  - **`lookupOption(name, id)`** gives the `currentOption`.
  - Errors go through `formatApiError`.
- **The banner:** "Development build: no sign-in" (ARB, with a description) at the top of the admin page.
  - It is shown when the build is not a release build, or when the admin build is made with `--dart-define=DEV_STUB=true`. This is a DESIGN CHOICE; the alternative is always shown until R8.
  - It has a screen-reader name.
  - It uses `colorScheme` only (rule 6).
- **A changelog entry** for the admin surface, because the banner is a visible change, with an ARB bullet and a screenshot.
- **No tenant switcher** in FF-0 (open question 2). The client sends no `X-Tenant-Id`, so the stub uses the default tenant.

## 5. Tests (failing first, where each can)

**The stub:**
- It is refused for `NODE_ENV` unset, empty and production, and accepted for development and test.
- It fills `req.user`, `req.tenantCompanyID` and the actor across an async hop.
- The header names a tenant the user holds: that tenant is used.
- The header names a tenant the user does not hold: 403.
- No header: the default tenant.
- The startup line is logged once.

**Lookups** (against the real seeded tables, inside a rolled-back transaction, L151):
- an unknown name gives 404;
- the platform rows plus the tenant's own rows are listed, and another tenant's rows are not;
- inactive rows are left out of the list, but returned by id;
- search is parameterized (a `'` and a `%` are searched literally);
- paging hits its cap;
- the order is `SortOrder`, then `Label`.

**Client:**
- the fetcher maps rows and errors;
- the picker shows a held inactive value as inactive;
- the banner has its name and passes the ×1.4 check at 320 px;
- the screenshot test.

**Existing tests:** none change, except those the product owner named: by L155, `tools/test/workflow-steps.js` and `tools/test/workflow-snapshots/e2e.yml.snap` (CI's e2e `.env` gains `NODE_ENV=development`) and `tools/test/verify-lock-fix.test.js` (test 177's cleanup); by L163, `app/test/shell_test.dart` (one `scrollUntilVisible` before the tap, because the banner pushes the button below the fold at ×1.4), and the cleanups of `tools/test/verify-lock-review.test.js` and `tools/test/verify-logs.test.js` with the shared `cleanWhenFree` in `tools/test/verify-scratch.js` (wait for the helper's exit, retry the delete for up to 5 s). No assertion changed in any of them. `routes/api.js` gains a group; S1's `me` tests stay as they are.

## 6. Definition of done for FF-0

Every item applies, except:
- `Waived: 3 (guard order) — the dev stub stands in; R1–R3, checked by R7's route-guard-order lint`;
- `Waived: 4 (permission and menu rows) — R2`;
- `Waived: 9 (automated e2e) — R12`. The API manual gains the lookups cases now.

**The retrofit ledger** (`plan/PH4-feature-first.md` §7) gains two rows, `GET /api/lookups/:name` and `GET /api/lookups/:name/:id`, each marked stub, no permission row, no menu row, no audit (read-only), no e2e.

**The companion-file sync table:**
- The API route row brings the tests, the API manual and Blueprint 4.15 (as built). The permission and menu seed rows are waived to R2.
- The setting row brings `DEV_STUB_USER_EMAIL` into `.env.example` and the Blueprint.
- The screen row brings ARB, the changelog, the screenshot, and the frontend manual's and smoke guide's banner rows.

## 7. Who and order

1. **api-coder,** in its copy, on a branch from main: the stub, then the lookups route.
2. **flutter-coder,** in its copy, after the route's response shape is merged or fixed in this plan (§3): the fetcher, then the banner.
3. **dod-reviewer** on each.
4. **Your sign-off:** one pull request each, merged on your go.

## 8. Rulings (L154, 2026-10-09, the product owner, each as recommended)

1. **The stub acts as `malladmin@gabay.test`**, the mall admin who holds both tenants (L119), named by `DEV_STUB_USER_EMAIL` in `.env`. Not taken: the SUPERADMIN, which has no tenant row and skips permission checks.
2. **No tenant switcher in FF-0.** Without a header the stub uses the user's first tenant by `Tenant.Code` (`DEMO_MALLS`, before `SPIKE_VENUES`) until R8's real switcher; a request may still send `X-Tenant-Id`. Not taken: a development switcher, removed in R8.
3. **Three lookups now**: `building-types`, `amenity-types`, `transit-types`. Each later slice adds its own name. Not taken: all eight now.

## 9. Rulings from the server review (L155, 2026-10-09, the product owner, each as recommended)

1. **CI's e2e `.env` gains `NODE_ENV=development`**, matching `.env.example`, because the stub refuses to start without it; the two tests that pin that step change with it. Not taken: `tools/verify.js` setting it for the emulator; relaxing the stub's guard (which would weaken L151).
2. **Inactive tenants:** the stub does not filter them; R1 (S2's tenant context) rules inactive-tenant behaviour, noted in Blueprint 4.15 and the retrofit ledger. Not taken: skip them now and refuse them in the header.
3. **Definition-of-done item 15** is N/A for FF-0 (no record type references a lookup yet); FF-1's plan carries the full end-to-end test (deactivate a referenced type, open the record, save, the value survives). Not taken: hold FF-0 open until FF-1.
