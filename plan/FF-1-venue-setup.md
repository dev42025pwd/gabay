# FF-1-venue-setup — P0-01 Venue, building and level setup (E-20)

> **Version**: 1.0 | **Date**: 2026-10-09 | **Status**: APPROVED by Genesis Perez, 2026-10-09 (the FF-1 to FF-4 batch, L156; `plan/FF-1-4-decisions.md`) | **Spec**: `spec/P0-01.md` r2 | **Intent**: `intent/P0-01-venue-setup.md` | **Parent**: `plan/PH4-feature-first.md` 1.0 §4 row FF-1 (L153, EXCEPTIONS E-20); builds on `plan/FF0-dev-stub-lookups.md` 1.0 (L154) and `plan/FF-SK-dashboards.md` 1.0 | **Pipeline entry**: P0-01 | **Approver**: Genesis Perez, product owner
>
> **Read for this plan:** CLAUDE.md; WORKING_AGREEMENT 1.15 §1–§5; PH4 §1, §4, §5, §7 (the ledger as it stands on `ff0-server`); FF-0 1.0 and its code on `ff0-server` / `ff0-client` (not merged yet); FF-SK 1.0; the spec (r2) and intent; `plan/FF-1-4-decisions.md` (§A10, §B1–§B15, §G2–§G4); `phase-reports/phase-2/P2-S9.md`; FEATURE_PIPELINE P0-01 and §5; `db/schema.sql` 0.14 (`Venue`, `Building`, `Level`, `BuildingType`, and every FK into them); `functions/src/utils/pagination.js`, `errors.js`, `db/index.js`, `requestContext.js`; `functions/test/authHelpers.js`; `tools/lint/schema-forms.js`, `tenant-predicate.js`; `app/lib/shared/forms/*`, `shared/components/*`, `shared/navigation/app_router.dart`; the `gabay-product-rulings` skill.
>
> **1.0 changes from 0.9:** cites spec r2 (AC-34 to AC-38 and the revised edge cases). Every question is ruled as 0.9 assumed (§0). G3's decimal form is applied, with one helper text per field. api-coder's read-only review fixes are applied (decision sheet §G item 4):
> - `FOR NO KEY UPDATE` locks;
> - both deletes take the venue lock;
> - the level list binds `VenueId`;
> - the decimal-column table (§2.3);
> - no concurrent requests through one savepoint connection;
> - the degenerate-boundary test;
> - id 0 rejected up front;
> - the FK noun table checked against `schema.sql`;
> - the delete-race test.

## 0. Rulings this plan builds on (all ruled 2026-10-09, as 0.9 assumed)

| Spec r1 question | Ruling | As built here |
|---|---|---|
| Q1 decimals | B1, ruled | `ColKind.decimal` only; `money`, `memo`, `date`, `datetime`, `fkMulti` stay in R11 (widens S9's bound; recorded in FF-1's `plan.html` row) |
| Q2 boundary | B2, ruled | No form field; the server stores a rectangle covering the levels (AC-34; DC-9) |
| Q3 refresh on return | B3, ruled | In the shared list machinery (§3.1) |
| Q4 removing | B4, ruled | Venue: Active switch, no delete route. Building and level: delete only when unused, else 409 |
| Q5 concurrent edits | B5, ruled | Optimistic check on `UpdatedAt` → 409 (DC-6) |
| Q6 level fields | B6, ruled | `ElevationM` and `CeilingHeightM` on the form; `WidthM`, `DepthM` > 0; `CeilingHeightM` > 0 when set; service and validators only, no migration |
| Q7 level rules | B7, ruled | Distinct ordinals per building (AC-35); one outdoor ground level per venue at ordinal 0 (AC-12); service checks under the venue lock (DC-7) |
| Q8 interiors | B8, ruled | Nothing in FF-1; FF-10 |
| Q9 roles | B9, ruled | Enforced at R2 (AC-31); the client hides writes now (B14, AC-36) |
| Q10 item 15 | B10, ruled | Integration test, widget test, manual case; the server refuses a new reference to an inactive type (§5) |
| Q11 lists | B11, ruled | Venues: Code and Name, sort Name. Buildings: Name, sort Name. Levels: Name and ShortName, `Ordinal` highest first. Codes as typed, exact uniqueness |
| Q12 counts | B12, ruled | None beyond paging and PRD §7 |

| This plan's 0.9 question | Ruling |
|---|---|
| 1. The L117 coder-model trial | B13 and §G2: the server half only. test-verifier writes the server tests first, then Opus 5.5 and Sonnet 5.5 each build it; the owner picks the branch merged (§7) |
| 2. Hiding writes before R2 | B14: hidden in the client from FF-SK's registry read-only marker; the server is unchecked until R2 (AC-36) |
| 3. The tenant header (spec vs FF-SK) | A10: compatible. FF-SK's switcher sends `X-Tenant-Id`; FF-1 has no tenant code (AC-37); spec r2 replaced r1's "no header" wording |
| 4. FF-SK not merged | B15: the server half starts; the client half waits for FF-SK (§7) |
| Decimals ".5" and "5." | §G3: refused on both sides; the hint shows "0.50" (AC-38) |

No question is open.

## 1. What FF-1 delivers

On localhost, in the admin page, behind FF-0's development stub, inside FF-SK's admin shell:

- **Venues:**
  - list: search, "Load more", the four states, inactive venues marked;
  - create, open and edit: Code, Name, map "up" angle, Active;
  - the boundary is derived by the server (AC-34).
- **Buildings,** under a venue:
  - list with the type's label;
  - create, open and edit: Name, type from `building-types`, optional "up" angle (blank means the venue's);
  - delete when the building has no levels.
- **Levels:** indoor levels under a building, and the venue's one outdoor ground level (L30).
  - Create, open, edit, and delete when nothing uses the level.
  - Fields: Ordinal, Name, ShortName, SpokenName (L112), ElevationM, WidthM, DepthM, GridCellM, CeilingHeightM.
- **Writes hidden per role** in the client (AC-36). Every list and write uses the tenant FF-SK's switcher picked (AC-37).
- **Shared machinery it adds** (each piece used by three screens, C2): `ColKind.decimal`, refresh on return, and the delete confirmation in `RoutedFormScaffold`.
- **FF-SK's registry:** the "Venues, buildings and levels" module flips to built, with its route `/venues`.

**Not in FF-1:** everything in spec §6: drawing, units, amenities, transit, the georeference, publish, seeds, sign-in, guards, audit rows, zod, the lookup screen, Tagalog, and any deploy.

## 2. The server part (api-coder)

### 2.1 Files

| File | Responsibility |
|---|---|
| `functions/src/routes/venues.js` | `/venues` collection and item routes; nested `/venues/:venueId/buildings` and `/venues/:venueId/outdoor-levels` collections |
| `functions/src/routes/buildings.js` | `/buildings/:buildingId` item routes; nested `/buildings/:buildingId/levels` |
| `functions/src/routes/levels.js` | `/levels/:levelId` item routes |
| `functions/src/services/venue.service.js` | venue reads and writes |
| `functions/src/services/building.service.js` | building reads and writes; the building-type rule (Blueprint DC8) |
| `functions/src/services/level.service.js` | level reads and writes; the ordinal and outdoor rules (B7); calls the boundary refresh |
| `functions/src/services/venueLock.js` | `lockVenue(tx, tenantId, venueId)`: the one `FOR NO KEY UPDATE` lock every level write and both deletes take first (DC-7) |
| `functions/src/services/venueBoundary.js` | the B2 rectangle: `ZERO_BOUNDARY`, `refreshBoundary(tx, tenantId, venueId)` |
| `functions/src/utils/fieldInput.js` | body readers shared by the three services: `readText`, `readOptionalText`, `readDecimal`, `readInteger`, `readFlag`, `readUpdatedAt`, `refuseIfDifferent` (each throws `httpError(400, '<Field> …')`) |
| `functions/src/utils/idParam.js` | `parseIdParam(text)`: `^[1-9]\d{0,8}$` → integer, anything else (0 included) → `httpError(404)` before any query (G4). Extracted from `lookup.service.js`'s `ID_PATTERN` (second use, C2); lookups switch to it, and their `0` was already a 404 (no row), so no behaviour changes |
| `functions/src/utils/foreignKeyInUse.js` | maps a caught `23503` by `err.constraint` to a person's noun. The table has one entry per FK into `Level` and `Building` in `db/schema.sql` (about 20: `fk_unit_level` → "units", `fk_beacon_level` → "beacons", …), with "other records" as the fallback. Never echoes driver text. `foreignKeyInUse.test.js` parses `schema.sql` (the linters' `tools/lint/lib/schema.js`) and fails when an FK into those tables has no entry, or an entry names no FK (G4) |
| `functions/src/routes/api.js` | three mounts in the "admin features (E-20)" group: `router.use('/venues', devStub, venueRoutes(...))`, `'/buildings'`, `'/levels'` |
| `functions/src/app.js` | builds the three services from `db` and passes them to `apiRoutes` |

FEATURE_PIPELINE names `routes/venues.js` and `services/venue.service.js`; the split into three is DC-2.

### 2.2 Routes (all behind `devStub`; tenant = `req.tenantCompanyID` only)

| Method and path | Does | Success |
|---|---|---|
| `GET /api/venues` | list, `search` on Code and Name, sort Name | 200 envelope |
| `POST /api/venues` | create | 201 venue |
| `GET /api/venues/:venueId` | one | 200 venue |
| `PUT /api/venues/:venueId` | edit (with `updatedAt`) | 200 venue |
| `GET /api/venues/:venueId/buildings` | list, `search` on Name, sort Name, type label joined | 200 envelope |
| `POST /api/venues/:venueId/buildings` | create | 201 building |
| `GET /api/venues/:venueId/outdoor-levels` | the outdoor ground level, as an envelope | 200 envelope |
| `POST /api/venues/:venueId/outdoor-levels` | create the outdoor ground level | 201 level |
| `GET /api/buildings/:buildingId` | one | 200 building |
| `PUT /api/buildings/:buildingId` | edit | 200 building |
| `DELETE /api/buildings/:buildingId` | delete if it has no levels | 204 |
| `GET /api/buildings/:buildingId/levels` | list, `search` on Name and ShortName, sort `Ordinal` DESC | 200 envelope |
| `POST /api/buildings/:buildingId/levels` | create an indoor level | 201 level |
| `GET /api/levels/:levelId` | one | 200 level |
| `PUT /api/levels/:levelId` | edit | 200 level |
| `DELETE /api/levels/:levelId` | delete if unreferenced | 204 |

- No venue delete route exists (B4).
- Every id in a path goes through `parseIdParam`.
- A parent or item outside the request's tenant is 404. Never 403, and never a 500 from a composite FK (AC-22): every parent is read first with its `TenantId = $1` predicate.

### 2.3 JSON contract (the parallel-build contract for flutter-coder)

- Keys are camelCase.
- **Decimals travel as strings both ways** (`"12.500"`), never as JSON numbers (DC-1).
- Timestamps are ISO 8601 with milliseconds.
- Errors use the standard `{ "error": "<message for a person>" }`. A validation message starts with the field's name as the form labels it.

```jsonc
// Venue (GET one, POST/PUT response)
{ "id": 12, "code": "AURORA", "name": "Aurora Mall", "mapUpDeg": "0.00", "isActive": true,
  "boundary": { "type": "Polygon", "coordinates": [[[0,0],[120,0],[120,80],[0,80],[0,0]]] },
  "createdAt": "2026-10-09T01:02:03.456Z", "createdBy": 3, "updatedAt": null, "updatedBy": null }
// Venue list item:  { "id", "code", "name", "mapUpDeg", "isActive" }
// POST /api/venues body: { "code": "AURORA", "name": "Aurora Mall", "mapUpDeg": "12.50" | null, "isActive": true }
// PUT  /api/venues/:id body: the same four fields, all present, plus "updatedAt": <the value loaded, may be null>
// A "boundary" key in a body is ignored, never written (AC-34)

// Building
{ "id": 40, "venueId": 12, "name": "Main", "buildingTypeId": 1, "buildingTypeLabel": "Main building",
  "buildingTypeIsActive": true, "mapUpDeg": null, "venueMapUpDeg": "0.00",
  "createdAt": "…", "createdBy": 3, "updatedAt": null, "updatedBy": null }
// Building list item: { "id", "name", "buildingTypeId", "buildingTypeLabel", "buildingTypeIsActive", "mapUpDeg" }
// POST body: { "name", "buildingTypeId", "mapUpDeg": "90.00" | null }
// PUT  body: the same three, plus "updatedAt"

// Level
{ "id": 77, "venueId": 12, "buildingId": 40, "isOutdoor": false, "ordinal": -1, "name": "Basement 1",
  "shortName": "B1", "spokenName": null, "elevationM": "-4.500", "widthM": "120.000", "depthM": "80.000",
  "gridCellM": "1.00", "ceilingHeightM": "3.20", "createdAt": "…", "createdBy": 3, "updatedAt": null, "updatedBy": null }
// Level list item: { "id", "ordinal", "name", "shortName", "isOutdoor" }
// POST (indoor) body: { "ordinal", "name", "shortName", "spokenName", "elevationM", "widthM", "depthM", "gridCellM", "ceilingHeightM" }
// POST (outdoor) body: the same without "ordinal" (the server sets 0; any other ordinal is 400)
// PUT  body: the same as its POST, plus "updatedAt"

// List envelope (parsePaging/runPaged): { "items": [...], "totalCount": 3, "page": 1, "pageSize": 25 }
```

**The decimal columns** (from `db/schema.sql`; the `FieldSpec`'s `required` follows the linter's rule):

| Column | Type | Required? | Blank means | Range (where checked) | Helper text (ARB) |
|---|---|---|---|---|---|
| `Venue.MapUpDeg` | `DECIMAL(6,2)` NOT NULL DEFAULT 0 | no | the default, 0 | 0 ≤ x < 360 (CHECK) | "For example 90.50. Blank: 0°" |
| `Building.MapUpDeg` | `DECIMAL(6,2)` NULL | no | NULL: the venue's angle | 0 ≤ x < 360 (CHECK) | "For example 90.50. Blank: the venue's angle (N°)" |
| `Level.ElevationM` | `DECIMAL(9,3)` NOT NULL DEFAULT 0 | no | the default, 0 | any sign (column limits) | "For example -4.500. Blank: 0 m" |
| `Level.WidthM` | `DECIMAL(9,3)` NOT NULL | **yes** | refused | > 0 (service, B6) | "For example 40.000" |
| `Level.DepthM` | `DECIMAL(9,3)` NOT NULL | **yes** | refused | > 0 (service, B6) | "For example 25.000" |
| `Level.GridCellM` | `DECIMAL(5,2)` NOT NULL DEFAULT 1.00 | no | the default, 1.00 | 0.25 to 2.00 (CHECK) | "For example 0.50. Blank: 1.00 m" |
| `Level.CeilingHeightM` | `DECIMAL(5,2)` NULL | no | NULL | > 0 when set (service, B6) | "For example 3.20. Blank: not known" |

Each field has one helper text: the accepted form, using an example written in G3's "0.50" style, plus what blank means. The defaults are named constants in the services, and `venues.schemaMirror.test.js` fails if they drift from `schema.sql` (DC-8).

**Body rules** (`fieldInput.js`):
- **Text** is trimmed. A required field that is missing or blank gets 400 "`<Field>` is required". An optional blank (`spokenName`) stores NULL. Length counts code points (`[...s].length`), as PostgreSQL `VARCHAR(n)` counts characters (DC-5).
- **A decimal** is `null`, `""`, or a string matching `^-?\d+(\.\d+)?$`.
  - That pattern refuses ".5" and "5." (G3, AC-38), and also a comma, spaces, `1e3` and a JSON number. Each gets 400 naming the field.
  - At most p−s integer digits and s fraction digits; never rounded.
  - Ranges compare exactly, with `Decimal` from `utils/money.js`.
- **`ordinal`** is a JSON integer in the `INT` range, else 400. For an outdoor level, anything but absent or 0 gets 400 (AC-12).
- **`isActive`** is a JSON boolean.
- **Read-only keys** (`id`, `tenantId`, `venueId`, `buildingId`, `isOutdoor`, the audit stamps): `refuseIfDifferent` gives 400 when one is present and differs from what the route implies (AC-13). Equal values are ignored, so a client may echo a loaded record (DC-4).
- **Any other unknown key,** `boundary` included, is ignored and never written. Refusing unknown keys waits for R5.
- **`updatedAt`** is required on PUT (missing gets 400). It is `null` or an ISO timestamp.

### 2.4 SQL shape

Rule 2: every statement binds `TenantId = $1` from `req.tenantCompanyID`. Rule 3: no request value appears except as a bound parameter. The order is fixed in each service, as `lookup.service.js` fixes it (DC-3).

**Lists,** through `runPaged`:
- **Venues:** `from 'gabay.Venue'`, `where 'TenantId = $1 AND ($2::text IS NULL OR Code ILIKE $2 OR Name ILIKE $2)'`. Sorted by `Name`; tie-breaker `VenueId`.
- **Buildings:** the parent check first. Then `from 'gabay.Building b JOIN gabay.BuildingType bt ON bt.BuildingTypeId = b.BuildingTypeId'`, `where 'b.TenantId = $1 AND b.VenueId = $2 AND ($3::text IS NULL OR b.Name ILIKE $3)'`. Sorted by `b.Name`; tie-breaker `b.BuildingId`. The label is the join (AC-8).
- **Levels of a building:** the parent check reads the building's `VenueId`. Then `where 'TenantId = $1 AND VenueId = $2 AND BuildingId = $3 AND ($4::text IS NULL OR Name ILIKE $4 OR ShortName ILIKE $4)'`. Binding `VenueId` lets `IX_Level_Venue (TenantId, VenueId, Ordinal)` serve it (G4).
- **The outdoor level:** `where 'TenantId = $1 AND VenueId = $2 AND BuildingId IS NULL'`.
- **Both level lists** are ordered `Ordinal DESC`, tie-breaker `LevelId`.
- `search` goes through `likePattern`. `pageSize` is capped at `MAX_PAGE_SIZE` (200).

**Writes:** every write runs in `db.withTransaction(tx => …)` and stamps `CreatedBy` and `UpdatedBy` from `getActorId()`. It catches only:
- `23505` on `uq_venue_tenant_code` → 409 "A venue with this code already exists" (AC-4). The index decides; there is no pre-check race.
- `23503` on a delete → 409 through `foreignKeyInUse`.

**Optimistic concurrency (B5),** one conditional statement:
```sql
UPDATE gabay.Venue
   SET Code = $3, Name = $4, MapUpDeg = $5, IsActive = $6, UpdatedBy = $7,
       UpdatedAt = GREATEST(clock_timestamp(), COALESCE(UpdatedAt, CreatedAt) + INTERVAL '1 millisecond')
 WHERE TenantId = $1 AND VenueId = $2 AND UpdatedAt IS NOT DISTINCT FROM $8::timestamptz
RETURNING …
```
- If no row comes back: `SELECT 1 FROM gabay.Venue WHERE TenantId = $1 AND VenueId = $2`. If the row exists, 409 "Someone else changed this venue. Reload to see their change"; otherwise 404.
- `Building` and `Level` use the same shape (DC-6).

**The venue lock (DC-7, G4).** `lockVenue` runs `SELECT VenueId FROM gabay.Venue WHERE TenantId = $1 AND VenueId = $2 FOR NO KEY UPDATE`.
- `FOR NO KEY UPDATE`, not `FOR UPDATE`: an insert under the venue takes `FOR KEY SHARE` on it through the FK, and `FOR UPDATE` would block every such insert. api-coder checked this on the local database (§G4).
- Two `FOR NO KEY UPDATE` locks on one row still exclude each other, so level writes and both deletes are serialised per venue.
- The boundary refresh's `UPDATE` touches no key column, so it fits under the lock.

**Building type (AC-6, AC-10, Blueprint DC8):** `SELECT IsActive FROM gabay.BuildingType WHERE BuildingTypeId = $2 AND (TenantId = $1 OR TenantId IS NULL)`.
- No row → 400 "Building type is not available".
- Inactive on create → 400 "That building type is no longer in use. Choose another".
- Inactive on update, when it differs from the building's current `BuildingTypeId` → the same 400. The current type is read in the same transaction with `SELECT BuildingTypeId FROM gabay.Building WHERE TenantId = $1 AND BuildingId = $2 FOR NO KEY UPDATE`.
- Inactive and unchanged → accepted (AC-9).

**Level writes** (B2, B7). Each one:
1. Resolves the venue. Indoor: `SELECT VenueId FROM gabay.Building WHERE TenantId = $1 AND BuildingId = $2`, else 404. Outdoor: the venue in the path. An edit or delete reads it from the level.
2. Calls `lockVenue`. An indoor create then re-reads the building, so a building deleted while it waited gives 404 (the spec's delete-versus-create edge).
3. Checks for a duplicate ordinal (AC-35): `SELECT 1 FROM gabay.Level WHERE TenantId = $1 AND VenueId = $2 AND BuildingId = $3 AND Ordinal = $4 AND LevelId IS DISTINCT FROM $5`. A hit is 409 "Another level of this building has ordinal N". The level's own unchanged ordinal passes; the same ordinal in another building passes.
4. Checks for a second outdoor level (AC-12): `… WHERE TenantId = $1 AND VenueId = $2 AND BuildingId IS NULL AND LevelId IS DISTINCT FROM $3`. A hit is 409 "This venue already has an outdoor ground level".
5. Inserts or updates. `VenueId`, `BuildingId` and `IsOutdoor` come from the parent, never the body.
6. Calls `refreshBoundary(tx, tenantId, venueId)`.

**Boundary (B2, AC-34).** A venue is created with `ZERO_BOUNDARY` (`[[0,0],[0,0],[0,0],[0,0],[0,0]]`). `refreshBoundary` runs:
```sql
UPDATE gabay.Venue
   SET BoundaryGeoJson = jsonb_build_object('type','Polygon','coordinates',
         jsonb_build_array(jsonb_build_array(jsonb_build_array(0,0), jsonb_build_array(m.w,0),
           jsonb_build_array(m.w,m.d), jsonb_build_array(0,m.d), jsonb_build_array(0,0))))
  FROM (SELECT COALESCE(MAX(WidthM),0) AS w, COALESCE(MAX(DepthM),0) AS d
          FROM gabay.Level WHERE TenantId = $1 AND VenueId = $2) m
 WHERE Venue.TenantId = $1 AND Venue.VenueId = $2
```
- It runs after every level create, edit and delete, so with no levels left the boundary is zero again.
- It does not touch the venue's `UpdatedAt` (DC-9).

**Deletes** (B4). Both take the venue lock first (G4):
- **Building:**
  1. `SELECT VenueId FROM gabay.Building WHERE TenantId = $1 AND BuildingId = $2`, else 404.
  2. `lockVenue`.
  3. `SELECT 1 FROM gabay.Level WHERE TenantId = $1 AND VenueId = $2 AND BuildingId = $3` → 409 "This building still has levels. Delete them first".
  4. `DELETE FROM gabay.Building WHERE TenantId = $1 AND BuildingId = $2`.
  
  A `23503` on `fk_level_building` (a level that got in anyway) maps to the same 409.
- **Level:**
  1. Read its `VenueId`, else 404.
  2. `lockVenue`.
  3. `DELETE FROM gabay.Level WHERE TenantId = $1 AND LevelId = $2`. A `23503` → 409 naming the user, for example "This level is still used by units".
  4. `refreshBoundary`.

**Never written:** `VenueVersion`, `Unit`, or any lookup row (the frozen-row trap; review).

### 2.5 Test support (new file, no existing test changes)

`functions/test/savepointDb.js` provides `openSavepointDb()`:
- It wraps `openRolledBackDb()` and returns a `db` whose `withTransaction(fn)` runs `fn` between `SAVEPOINT ff1_n` and `RELEASE` / `ROLLBACK TO SAVEPOINT`.
- **Why it is needed:** the real `withTransaction` on the rolled-back single connection would `BEGIN` again and then `COMMIT` the outer transaction, keeping test rows (L151). A unique or FK error inside a service write is undone only to the savepoint, so the test can go on.
- **Proof:** `savepointDb.test.js` shows nothing survives `close()`, and that a failed inner write leaves the outer transaction usable.

**No test fires concurrent requests through one savepoint connection (G4).** Every request in a test is awaited before the next. The concurrency edge cases (two codes at once, a stale edit, the ordinal and outdoor rules, delete versus create) are tested in sequence:
- the unique index and the conditional `UPDATE` decide on the data, not on timing;
- the delete race is staged deterministically (§4, `buildings.deleteRace.test.js`);
- the lock itself is proved by review and by api-coder's local check, not by a timing test.

## 3. The client part (flutter-coder)

### 3.1 Shared machinery (each used by FF-1's three screens; R11 builds on it)

- **`ColKind.decimal`** (B1):
  - In `field_spec.dart`, with a `DecimalRange? range` argument (`min`, `max`, `minExclusive`, `maxExclusive`, as strings; the linter ignores it).
  - The resolver in `spec_form_field.dart` gives a text input with a decimal keyboard. The value stays a **string**; there is no `double` anywhere (DC-1).
  - Validators in `field_validators.dart`, each message naming the field:
    - required;
    - the shape `^-?\d+(\.\d+)?$`, so ".5" and "5." are refused (G3, AC-38);
    - at most `scale` places, and the integer digits;
    - the range, compared exactly by scaled `BigInt`.
  - Blank gives `null`; the ViewModel sends `null`, and the server applies the default.
  - Each field shows one helper text from §2.3's table, for example "For example 0.50. Blank: 1.00 m".
- **Refresh on return** (B3, item 7; also after a delete, AC-21):
  - `shared/navigation/route_observer.dart` holds one `RouteObserver<ModalRoute<void>>` provider. It is registered in the `GoRouter`'s `observers` and in FF-SK's `ShellRoute` `observers`.
  - `shared/components/refresh_on_return.dart` is a `RouteAware` widget that calls `onReturn` in `didPopNext`.
  - `ModuleListScaffold` gains an optional `onReturn`, set to the list's `PagedListNotifier.reload`.
  - Forms are child routes. Save, Delete and Back return with `context.go(listPath)`.
  - RECALLED, and verified by a widget test before it carries weight: removing the top page through `go` reports a pop to the observer, and `ShellRoute` takes `observers`. If it does not, forms open with `context.push` and close with `pop`.
- **Delete in `RoutedFormScaffold`** (B4): optional `onDelete` and `deleteLabel`, behind a confirmation dialog whose default and focused action is Cancel (§4.6).
- **Write controls per role** (B14, AC-36). A small `canWrite` reader over FF-SK's registry entry and its read-only marker for the switcher's chosen role:
  - **VIEWER:** no New, Save or Delete on any FF-1 screen; every form opens read-only, the Active switch included.
  - **VENUE_EDITOR:** no New on the venue list, and the venue form is read-only with no Save. Buildings and levels, the outdoor ground level included, keep New, Save and Delete.
  - **SUPERADMIN and MALL_ADMIN:** every control.
  - This is client-only, and per-venue grants are not applied (R2).

### 3.2 Feature files: `app/lib/features/admin/venues/`

- **`models/`:**
  - `venue.dart`, `building.dart`, `level.dart`: immutable records with `fromJson`; decimals as `String?`.
  - `venue_field_specs.dart`, `building_field_specs.dart`, `level_field_specs.dart`: one `FieldSpec` per column, with `required` as §2.3's table gives it. For example `FieldSpec(table: 'Level', name: 'WidthM', kind: ColKind.decimal, required: true, scale: 3, range: …)`, `FieldSpec(table: 'Building', name: 'BuildingTypeId', kind: ColKind.fk, required: true)`, `FieldSpec(table: 'Venue', name: 'IsActive', kind: ColKind.flag)`.
  - The audit stamps and `IsOutdoor` are `readOnly: true` (AC-19). `VenueId`, `BuildingId`, `LevelId`, `TenantId` and `BoundaryGeoJson` have no spec and are never inputs.
- **`services/venue_admin_service.dart`:** stateless, over the one `ApiClient`.
  - Venues: `listVenues`, `getVenue`, `createVenue`, `updateVenue`.
  - Buildings: `listBuildings`, `getBuilding`, `createBuilding`, `updateBuilding`, `deleteBuilding`.
  - Levels: `listLevels`, `listOutdoorLevels`, `getLevel`, `createIndoorLevel`, `createOutdoorLevel`, `updateLevel`, `deleteLevel`.
  - Each returns a `PageResult<T>` or a model, and passes the `ApiClient`'s errors through unchanged.
- **`view_models/`:**
  - Lists: `VenueListViewModel`, `BuildingListViewModel` (a family by venue id) and `LevelListViewModel` (a family by building id), each a `PagedListNotifier`.
  - Forms: `VenueFormViewModel`, `BuildingFormViewModel` and `LevelFormViewModel`. Each holds the values (echoing `onChanged` verbatim and trimming on save, S9 §6), `isSubmitting`, the loaded `updatedAt` and the save error.
  - `BuildingFormViewModel` builds the type picker's fetcher with `ref.read(lookupServiceProvider).lookupFetcher(LookupName.buildingTypes)`, and on open loads `currentOption` with `lookupOption(LookupName.buildingTypes, id)` (AC-9).
- **`views/`:**
  - `venue_list_screen.dart` and `venue_form_screen.dart`. When editing, the venue form shows a "Buildings" link, an "Outdoor ground" section (the level's name, or "Add outdoor ground"), and AC-34's boundary note.
  - `building_list_screen.dart` and `building_form_screen.dart`. The angle's helper text names the venue's angle (AC-7).
  - `level_list_screen.dart` and `level_form_screen.dart`, one form for indoor and outdoor levels. On the outdoor form the Ordinal is read-only, 0.
- **Routes** (go_router, inside FF-SK's shell): `/venues`, `/venues/new`, `/venues/:venueId`, `/venues/:venueId/buildings`, `…/buildings/new`, `…/buildings/:buildingId`, `…/buildings/:buildingId/levels`, `…/levels/new`, `…/levels/:levelId`, `/venues/:venueId/outdoor/new` and `/venues/:venueId/outdoor/:levelId`.
- **Tenant:** FF-1 sends nothing of its own. The `ApiClient` carries FF-SK's `X-Dev-Act-As` and `X-Tenant-Id` (AC-37).
- **Registry:** in `app/lib/core/modules/module_registry.dart` (FF-SK), the P0-01 entry becomes built, with the route `/venues`.
- **Wording:** about 50 ARB strings, each with a description:
  - titles, field labels and the seven helper texts;
  - the empty states, one plain and one for a search;
  - the inactive marker (S9's "(inactive)", reused);
  - the delete confirmation;
  - the boundary note: "The site outline covers the largest level until it is drawn in the map editor".
  
  Colours come only from `colorScheme`.
- **Changelog (admin surface):** "You can now set up a venue, its buildings and their levels", with its ARB bullet.

## 4. Tests first, and traceability (every AC and edge case of r2)

**Who writes them.**
- **Server tests:** test-verifier writes them first, on `ff1-server-tests` (B13). Both trial builds aim at the same tests.
- **Client tests:** flutter-coder writes them first, where each can.
- test-verifier completes the table with the results.

**How the API tests run.** They use `openSavepointDb()` through `createApp`, so the stub, the routes, the services and the real local tables are all in play. Every row stays inside the rolled-back transaction (L151). The tenants are the test's own (`createSeeder`), plus the seeded `BuildingType` rows where a case needs them.

**Server tests** (`functions/test/`): `venues.test.js`, `buildings.test.js`, `buildings.deleteRace.test.js`, `levels.test.js`, `venues.tenantBoundary.test.js`, `buildings.inactiveType.test.js` (AC-9), `fieldInput.test.js` (unit), `venueBoundary.test.js`, `venues.schemaMirror.test.js` (the defaults and CHECK ranges against `db/schema.sql`), `foreignKeyInUse.test.js`, `savepointDb.test.js`, `idParam.test.js`.

**Client tests** (`app/test/`):
- `forms/decimal_field_test.dart`, `forms/decimal_ranges_schema_test.dart`, `forms/refresh_on_return_test.dart`, `forms/routed_form_scaffold_delete_test.dart`;
- under `features/admin/venues/`: `venue_field_specs_test.dart`, `venue_admin_service_test.dart`, `venue_list_screen_test.dart`, `venue_form_screen_test.dart`, `building_list_screen_test.dart`, `building_form_screen_test.dart`, `level_list_screen_test.dart`, `level_form_screen_test.dart`, `venues_role_controls_test.dart`, `venues_accessibility_test.dart`, `venues_registry_test.dart`;
- new scenarios in `screenshot_test.dart`.

**Lint test:** `tools/lint/test/schema-forms-venues.test.js`.

| AC / edge case | Test file(s) | Kind |
|---|---|---|
| AC-1 create venue (Active on by default, no boundary field), stamps, list shows it | `venues.test.js`; `venue_form_screen_test.dart`, `refresh_on_return_test.dart` | API; widget |
| AC-2 edit venue, `UpdatedBy`/`UpdatedAt`, reopen | `venues.test.js`; `venue_form_screen_test.dart` | API; widget |
| AC-3 list: tenant only, search Code and Name, sort Name, inactive marked, envelope, cap 200, Load more, four states | `venues.test.js`; `venue_list_screen_test.dart` | API; widget |
| AC-4 duplicate code 409 naming the field; same code in another tenant OK; "aurora" and "AURORA" both OK | `venues.test.js` | API |
| AC-5 create building, picker over `lookupFetcher('building-types')` | `buildings.test.js`; `building_form_screen_test.dart` | API; widget |
| AC-6 platform plus own types; another tenant's type refused | `buildings.test.js`; `building_form_screen_test.dart` | API; widget |
| AC-7 blank angle → NULL; the venue's angle in the helper text; clearing stores NULL | `buildings.test.js`; `building_form_screen_test.dart` | API; widget |
| AC-8 label joined; renaming the type changes the list, `Building` untouched; search Name, sort Name | `buildings.test.js`; `building_list_screen_test.dart` | API; widget |
| AC-9 item 15 in full | §5: `buildings.inactiveType.test.js`; `building_form_screen_test.dart` ("holds T, sends T"); manual FF1 cases in both manuals | integration; widget; manual |
| AC-10 new or changed reference to an inactive type → 400 naming the type; unchanged kept; picker never offers it | `buildings.inactiveType.test.js`; `building_form_screen_test.dart` | API; widget |
| AC-11 indoor level fields with §2.3's required and blank behaviour; `IsOutdoor` false; `VenueId` from the building | `levels.test.js`; `level_form_screen_test.dart` | API; widget |
| AC-12 outdoor level: `BuildingId` NULL, ordinal 0 read-only, a non-zero ordinal 400, a second one 409 | `levels.test.js`; `level_form_screen_test.dart` | API; widget |
| AC-13 venue, building and outdoor pairing refused, never 500 | `levels.test.js` (`venueId`, `buildingId`, `isOutdoor` sent differing → 400) | API |
| AC-14 edit level, stamps | `levels.test.js`; `level_form_screen_test.dart` | API; widget |
| AC-15 `Ordinal` DESC for both lists, search Name and ShortName, columns, Load more, four states | `levels.test.js`; `level_list_screen_test.dart` | API; widget |
| AC-16 specs match the schema; `ColKind.decimal`; no bare text field | `schema-forms-venues.test.js`, `venue_field_specs_test.dart`, `decimal_field_test.dart`; `npm run verify` (`schema-forms`, `no-bare-textfield`) | lint test; widget; verify |
| AC-17 each validator, client and server, each record kind (B6 ranges included) | `decimal_field_test.dart`, `decimal_ranges_schema_test.dart`, the three form tests; `fieldInput.test.js`, `venues.test.js`, `buildings.test.js`, `levels.test.js` | widget/unit; API |
| AC-18 `formatApiError`; the form keeps values on unreachable, 4xx (409 included) and 5xx; retry | the three form tests (a fake `ApiClient` throwing each) | widget |
| AC-19 read-only columns, the boundary included, are never inputs | `venue_field_specs_test.dart`; the form tests | unit; widget; review |
| AC-20 double Save → one create | the three form tests (two taps, one call counted) | widget |
| AC-21 refresh on return after create, edit and delete | `refresh_on_return_test.dart` (real `GoRouter`); the three list tests | widget |
| AC-22 cross-tenant read, update, delete, list and create-under → 404; the reverse with `X-Tenant-Id` | `venues.tenantBoundary.test.js`; frontend manual case "switch to Spike Venues: the lists change" | API; manual |
| AC-23 tenant binding, no interpolation, fixed order | `npm run verify` (`tenant-predicate`, `sql-interpolation`); REVIEW.md security pass | lint; review |
| AC-24 Active switch, no venue delete route; building and level delete allowed and refused; confirm defaults to Cancel | `venues.test.js` (`DELETE /api/venues/:id` → 404), `buildings.test.js`, `levels.test.js`; `routed_form_scaffold_delete_test.dart`, `venue_form_screen_test.dart` | API; widget |
| AC-25 stale `updatedAt` → 409 on each kind; a never-edited row's null token accepted once, then stale | `venues.test.js`, `buildings.test.js`, `levels.test.js`; the form tests (409 shown, values kept) | API; widget |
| AC-26 screen-reader names; ×1.4 at 320 px | `venues_accessibility_test.dart` | widget |
| AC-27 ARB with descriptions; colours | `arb_integrity_test.dart` (existing, unchanged, runs over the new keys); `npm run verify` (`colour-literals`, `flutter analyze`) | unit; lint |
| AC-28 screenshots (six screens, light and dark, phone and tablet; the inactive-type state) | `screenshot_test.dart` new scenarios | screenshot |
| AC-29 changelog entry | Stop hook and pre-commit pair; `version_test.dart` (existing, unchanged) | hook |
| AC-30 routes behind the stub; stamps from the actor | every API file (calls go through `createApp`; `CreatedBy` is the acting user) | API; ledger review |
| AC-31 server roles | Waived to R1/R2 (§9). No FF-1 test: the server has no role check before R2 | — |
| AC-32 permission and menu rows | Waived to R2 | — |
| AC-33 automated e2e phase | Waived to R12; the manual cases are written now (§6) | manual |
| AC-34 boundary: zero on create; after a level create, edit and delete; zero again after the last delete (the degenerate case, G4); venue `UpdatedAt` unchanged; a body `boundary` ignored; the form note | `venueBoundary.test.js`, `levels.test.js`, `venues.test.js`; `venue_form_screen_test.dart` | API; widget |
| AC-35 duplicate ordinal in one building → 409 naming it; the same ordinal in two buildings OK; own unchanged ordinal OK | `levels.test.js` | API |
| AC-36 write controls per role (VIEWER, VENUE_EDITOR, MALL_ADMIN, SUPERADMIN) | `venues_role_controls_test.dart` (each role's registry entry over every FF-1 screen) | widget |
| AC-37 the switcher's tenant drives every list and write | the AC-22 manual case; the API side is AC-22's test | manual |
| AC-38 ".5" and "5." refused, field named; the "0.50" hint shown | `decimal_field_test.dart`; `fieldInput.test.js`, and one case per record kind in `venues.test.js`, `buildings.test.js`, `levels.test.js` | widget; API |
| Edge: API lost mid-list; a failed Load more keeps rows | the list tests (S9's `loadMoreError`) | widget |
| Edge: API lost mid-save or mid-delete keeps values; the record is not shown as removed | the form tests | widget |
| Edge: stale shopper package | N/A: no publish until FF-3 (spec) | — |
| Edge: empty tenant, venue with no buildings, building with no levels, no outdoor level (create action hidden for VIEWER); search with no match | the list tests; `venue_form_screen_test.dart` ("Add outdoor ground"); `venues_role_controls_test.dart` | widget |
| Edge: exact maximum lengths accepted, one more refused (both sides) | `fieldInput.test.js`, the three API files; the form tests | unit; API; widget |
| Edge: "Parañaque Annex" and non-ASCII counted in characters | `fieldInput.test.js`; `buildings.test.js` (a 200-character name with Ñ stored) | unit; API |
| Edge: decimal limits (999999.999 and −999999.999; WidthM/DepthM 0.001 OK, 0 and negative refused; 359.99/360.00; 0.25/2.00/0.24/2.01; CeilingHeightM 0.01/999.99 OK, 0 and negative refused; one place too many) | `fieldInput.test.js`, `levels.test.js`; `decimal_field_test.dart` | unit; API; widget |
| Edge: `Ordinal` at the INT limits accepted, beyond refused | `fieldInput.test.js`, `levels.test.js` | unit; API |
| Edge: `pageSize` 0, negative, non-number, >200; last page hides the footer | `venues.test.js`; `venue_list_screen_test.dart` | API; widget |
| Edge: a list past one page (scale) | `venues.test.js` (pageSize 2 over 3 rows: `totalCount`, page 2) | API |
| Edge: cross-tenant (AC-22), another tenant's type (AC-6), the same code in two tenants (AC-4) | as those rows | API |
| Edge: `X-Tenant-Id` the acting user does not hold → 403 | `venues.tenantBoundary.test.js` (one call; the stub's own test covers the rest) | API |
| Edge: client hiding per role | AC-36 | widget |
| Edge: a VIEWER's write sent directly succeeds until R2 | Not tested now: no role check exists before R2 (E-20, waiver 3); recorded in the ledger rows | — |
| Edge: a 403 shown through `formatApiError` | `venue_list_screen_test.dart` (fake 403) | widget |
| Edge: two admins edit one record | AC-25 (in sequence) | API |
| Edge: a level written while a venue form is open; the venue save still succeeds | `venues.test.js` (load venue, create a level, PUT the venue with the loaded token → 200) | API |
| Edge: two creates with the same code | `venues.test.js` (in sequence; the second insert hits the index → 409 inside its savepoint) | API |
| Edge: same ordinal or a second outdoor level from two writes | `levels.test.js` (in sequence → 409); the serialisation is the venue lock (review, §2.5) | API; review |
| Edge: a building or level edited after another admin deleted it → 404, values kept | `buildings.test.js`, `levels.test.js`; the form tests | API; widget |
| Edge: a building delete versus a level create | `buildings.deleteRace.test.js`: a level inserted between the delete's pre-check and its `DELETE` (a `tx.query` wrapper inserts it in SQL after the pre-check statement) → the FK gives 409 "still has levels", the building stays. `levels.test.js`: a level create under a deleted building → 404 | API |
| Edge: publish in progress; `VenueVersion` never written | N/A until FF-3; review (no `VenueVersion` in FF-1's files) | review |
| Edge: ".5", "5.", comma, spaces, `1e3`, a JSON number | `fieldInput.test.js`; `decimal_field_test.dart` | unit; widget |
| Edge: malformed JSON → 400 | `venues.test.js` (one case; `errors.js` owns it) | API |
| Edge: unknown keys, `boundary` among them, ignored | `venues.test.js` | API |
| Edge: building with no type | `building_form_screen_test.dart`; `buildings.test.js` (400) | widget; API |
| Edge: an outdoor level with a non-zero ordinal → 400 | `levels.test.js` | API |
| Edge: an id that is not a positive integer, 0 included → 404 before any query | `idParam.test.js`; one case per item route in the API files | unit; API |
| Edge: whitespace-only required text refused; a blank optional → NULL | `fieldInput.test.js`; `levels.test.js` (`spokenName`) | unit; API |
| Edge: Codes differing only in case | AC-4 | API |
| Edge: type deactivated while the form is open | AC-9 | integration |
| Edge: a deactivated type for a new or a changed building | AC-10 | API; widget |
| Edge: a tenant type and a platform type with the same label | `buildings.test.js` (both returned by the lookup; the picker shows the label only, as in FF-0) | API |
| Edge: no active types → empty picker, cannot save | `building_form_screen_test.dart` | widget |
| Edge: level paired with another venue's building; indoor without building; outdoor with one | AC-13 | API |
| Edge: duplicate ordinals (AC-35); a second outdoor level (AC-12) | `levels.test.js` | API |
| Edge: deleting a building with levels, or a referenced level | AC-24; `levels.test.js` (a `Unit` on the level → 409 "still used by units") | API |
| Edge: an inactive venue is listed, marked and editable, with its buildings and levels | `venues.test.js`, `buildings.test.js`; `venue_list_screen_test.dart` | API; widget |
| DC-8: service defaults and ranges equal `schema.sql` | `venues.schemaMirror.test.js`; `decimal_ranges_schema_test.dart` | unit |
| G4: the FK noun table covers every FK into `Level` and `Building` | `foreignKeyInUse.test.js` | unit |
| The savepoint helper never keeps a row | `savepointDb.test.js` | unit |
| Registry: P0-01 built; the menu opens the real list, not the placeholder | `venues_registry_test.dart` | widget |

**Existing tests:** none change.
- `screenshot_test.dart` gains scenarios only, as FF-0's banner did.
- `ModuleListScaffold` and `RoutedFormScaffold` gain optional parameters, so their tests run unchanged.
- `lookup.service.js` moves to `parseIdParam` with no behaviour change, so `lookups.test.js` is unchanged.

If any existing test would have to change (for example an FF-SK registry test that pins P0-01 as a placeholder), the coder stops and returns it as a question: the change needs the owner's ruling (C1).

## 5. The end-to-end item 15 test (AC-9; L155; B10)

`functions/test/buildings.inactiveType.test.js` runs in `npm run verify` (api-tests). It goes through the real `createApp`: the stub, the routes, the services and the local PostgreSQL, inside `openSavepointDb()`.

1. Seed a tenant, the stub's user, venue V and a tenant-owned type T (active). `POST /api/venues/V/buildings` creates B with T (201).
2. Deactivate T in SQL: `UPDATE gabay.BuildingType SET IsActive = FALSE WHERE BuildingTypeId = T` (the maintenance screen comes in R11).
3. `GET /api/buildings/B` returns `buildingTypeId` T, `buildingTypeLabel` T's label and `buildingTypeIsActive` false. `GET /api/lookups/building-types/T` returns T with `isActive` false: the source of the picker's `currentOption`.
4. `PUT /api/buildings/B` changes only `name`, sending `buildingTypeId` T and the loaded `updatedAt`: 200.
5. `SELECT BuildingTypeId FROM gabay.Building WHERE TenantId = $1 AND BuildingId = $2` still gives T.
6. A second `GET` again shows T, inactive.
7. `GET /api/lookups/building-types?search=<T's label>` does not include T.
8. The negative halves (AC-10): `POST` a new building with T → 400 naming the type; `PUT` another building from an active type to T → 400.

**The client half** is in `building_form_screen_test.dart`. With a fake service returning B as above, the form shows "T's label (inactive)", never an id or an empty field, and Save sends `buildingTypeId` T.

**The manual cases** are FF1.x in both E2E manuals: deactivate T with `psql`, open B in the browser, rename it, save, and reopen it.

No browser-level automated test is built (B10; R12).

## 6. Records

**Retrofit ledger** (`plan/PH4-feature-first.md` §7). One row per route, in the ledger's columns:

| Column | Value |
|---|---|
| Tenant context | "stub (`devStub`)" |
| Guard order | "open" |
| Permission row | "none" |
| Menu row | "none" |
| Audit | "open (R3)" for each POST, PUT and DELETE; "n/a (read-only)" for each GET |
| Validation | "open (hand-written `fieldInput`; zod in R5)" |
| E2E | "none (manual FF1.x)" |

- **The routes:** the 16 routes of §2.2. Each write route also notes "any role may write until R2; the client hides writes (AC-36)".
- **The screens:** venue list, venue form, building list, building form, level list, and level form (indoor and outdoor). Each has the menu row "registry (FF-SK) → R8" and the note "client-side role hiding → R2/R8".

**Testing documents:**
- **`docs/testing/E2E_Test_Cases_Manual.md`:** a "Phase FF1 — Venues, buildings and levels (P0-01)" table of curl cases per route:
  - success;
  - 400 per field, ".5" and "5." included;
  - 404 cross-tenant, and for id 0;
  - 409 for a duplicate code, a stale edit, a duplicate ordinal, a second outdoor level, and a delete in use;
  - AC-9's steps.
- **`docs/testing/E2E_Frontend_Test_Cases_Manual.md`:** the FF1 phase:
  - each screen's four states, create, edit, the delete confirmation and refresh on return;
  - the inactive type, ×1.4, the controls per role;
  - "switch to Spike Venues: the lists change".
- **`docs/testing/Smoke_Test_Guide.md`:** one module row: "create a venue, a building, a level; see them listed".

**Product documents:**
- **Blueprint:**
  - Part 4 §4.6, "as built (FF-1)": the routes, the derived boundary (B2), the concurrency check and the venue lock.
  - The Part 1 invariant 10 note for the placeholder boundary (G4).
- **PRD:** G4 notes for B2 (the boundary) and B8 (nested interiors in FF-10).
- **FEATURE_PIPELINE:** P0-01's Intent and Spec fields; Status `IN PROGRESS` at the start; `DONE` and the §6 archive at sign-off.

**App records:**
- **ARB and changelog:** `app_en.arb`; the admin entry in `app/lib/core/config/changelog.dart`, with its ARB bullet. Tagalog comes with P0-14.
- **Screenshots:** AC-28's 24 images, attached to the PR and to the slice report, `phase-reports/feature-first/FF-1.md`.
- **The trial's result** (§7): its measurements go in the slice report, and the ruling on the coder model in a `plan.html` row.

**Companion-file sync table:**

| Row | What FF-1 does |
|---|---|
| `db/schema.sql` | No change: B1, B4, B6 and B7 add no column, CHECK or index |
| An API route | Tests (§4); e2e waived to R12; permission and menu seed waived to R2; Blueprint Part 4; the API manual |
| A screen or its wording | ARB, changelog, screenshots, the frontend manual, the smoke guide |
| A dependency | None added (decimals are strings; `decimal.js` is already pinned) |
| A setting, limit or option list | None new. The defaults mirror the schema (DC-8); building types stay in their table (rule 5) |
| A command or check | None |
| An owner ruling | Recorded by the main session in FF-1's L156 `plan.html` row (B1–B15, §G2–§G4) and on the modules page; B2 and B8 also in the `gabay-product-rulings` skill |
| A pipeline entry's state | FEATURE_PIPELINE, as above |
| A deploy or an incident | None (E-20) |

## 7. Who and order

**0. Preconditions.**
- FF-0 merged, server and client.
- This plan and spec r2 approved (done, L156).
- For the client half: FF-SK merged (the shell, the registry, the `ShellRoute`). If FF-SK has not merged, the server half starts and the client half waits (B15).

**1. Server tests first.** test-verifier, in `Gabay-wt\api-coder` on branch `ff1-server-tests` from `main`:
- writes every server test of §4 (with `savepointDb.js`), failing;
- commits them on that branch for both builds (B13).

**2. The coder-model trial on the server half (B13, §G2).** Both builds run in `Gabay-wt\api-coder`, one after the other, so there is one verify at a time. Each branches from `ff1-server-tests` and builds §2 in full.
1. **Opus 5.5** (an `Agent` model override on api-coder) builds on `ff1-server-opus`.
2. **Sonnet 5.5** (the pinned model) builds on `ff1-server`.

Neither build edits a test. A test it thinks is wrong goes back as a question.

**Measured for each build:**
- tokens and cost per completed task (L62);
- `npm run verify` green at the first hand-back;
- review rounds to "ready";
- dod-reviewer's findings by severity.

The owner picks the branch that becomes the server PR, and the other branch is deleted.

**3. The client half.** flutter-coder, in `Gabay-wt\flutter-coder` on branch `ff1-client`, in parallel with step 2 against §2.3's contract, with a fake `ApiClient` in every widget test. In order:
1. the shared machinery: `ColKind.decimal`, refresh on return, delete, `canWrite`;
2. the models, the service, the ViewModels and the screens;
3. the registry flip;
4. ARB, changelog, screenshots, the frontend manual and the smoke guide.

It runs against the live API only after the server PR merges (for the manual cases and the screenshots of real data).

**4. test-verifier,** in each copy: the traceability table with its results, and `npm run verify` pasted.

**5. dod-reviewer,** on each branch.

**6. The product owner:** two pull requests, server first, each merged on its own go.

## 8. DESIGN CHOICES (each with an alternative)

- **DC-1. Decimals stay strings end to end.** The API JSON, the Dart model and the form value are all strings. They are validated by pattern and compared exactly: `Decimal` on the server, scaled `BigInt` in Dart.
  - *Alternative:* JSON numbers and Dart `double`, which are easier to type in curl but open to float rounding.
  - *Alternative:* the Dart `decimal` package, which needs a pin and an EXCEPTIONS check.
- **DC-2. Three route files and three service files** (venues, buildings, levels), with flat item routes and nested collection routes.
  - *Alternative:* the pipeline's single `routes/venues.js` and `venue.service.js`, fully nested. Fewer files, but about 600 lines in one.
- **DC-3. A fixed list order per list.** The client sends no `sortBy`, as in `lookup.service.js`.
  - *Alternative:* an allow-listed `sortBy`, unused by any screen until Phase 3's sort.
- **DC-4. Read-only keys are refused only when they differ** from the route's values.
  - *Alternative:* refuse them whenever present, which breaks a client that echoes a loaded record.
- **DC-5. Lengths count code points** (`[...s].length`), as PostgreSQL counts characters.
  - *Alternative:* `s.length` (UTF-16 units), which refuses some valid emoji names. The Dart side keeps S9's `String.length`, which is stricter, never looser.
- **DC-6. Optimistic concurrency is one conditional `UPDATE`.** `UpdatedAt` is set to `GREATEST(clock_timestamp(), previous + 1 ms)`, so it changes even inside one test transaction, where `now()` is constant.
  - *Alternative:* `now()` with a re-read in the transaction, which cannot be tested inside a rolled-back transaction.
  - *Alternative:* `xmin`, which stays the same across updates in one transaction.
- **DC-7. Level rules are checked under a `FOR NO KEY UPDATE` lock on the venue row,** taken by every level write and both deletes (G4).
  - *Alternative:* unique indexes, which need a migration and do not cover the delete race.
  - *Alternative:* `FOR UPDATE`, which would block every insert under the venue.
- **DC-8. Schema defaults are mirrored as service constants,** guarded by a test that reads `schema.sql`.
  - *Alternative:* SQL `DEFAULT` keyword variants, one statement per combination of nullable fields.
- **DC-9. The boundary rectangle covers every level** (the largest `WidthM` and the largest `DepthM`), and refreshing it leaves the venue's `UpdatedAt` alone. Spec r2's AC-34 cites this.
  - *Alternative:* the dimensions of the largest-area level, which may not cover a long, thin level.
  - *Alternative:* bumping `UpdatedAt`, which would make an open venue form stale whenever a level changes.
- **DC-10. Every service write runs in `withTransaction`, and the tests use a savepoint wrapper** (§2.5).
  - *Alternative:* `INSERT … ON CONFLICT DO NOTHING` and pre-checks to avoid database errors. Less general, because deletes still need the FK error.
- **DC-11. A delete that is still in use is caught as `23503`** and mapped by constraint name, from a table kept equal to `schema.sql` by a test, with a fallback.
  - *Alternative:* `EXISTS` checks over the tables that reference `Level`, a list every later slice must remember to extend.
- **DC-12. Refresh on return uses one `RouteObserver` and `context.go`** (RECALLED behaviour; tested first; the fallback is `push`/`pop`).
  - *Alternative:* invalidating the list provider on save. That is "refresh after save", not item 7's `didPopNext`.
- **DC-13. The `DecimalRange` argument on `FieldSpec`,** guarded by a Dart test against the schema's CHECK text.
  - *Alternative:* extend the `schema-forms` linter to parse CHECKs (Phase 3 scope).
- **DC-14. One helper text per decimal field:** the accepted form, with an example such as "0.50", plus what blank means.
  - *Alternative:* a separate format hint and default note, which is two lines per field at ×1.4.

## 9. Definition of done (FEATURE_PIPELINE §5) for FF-1

| # | Status |
|---|---|
| 1 | N/A: no column, CHECK or index added (B1, B4, B6, B7) |
| 2 | N/A: the seeds already write these tables; FF-2 finishes them |
| 3 | `Waived: 3 (guard order) — the dev stub stands in; R3 adds the audit rows; fitted in R1–R3 and checked by the route-guard-order lint, R7` |
| 4 | `Waived: 4 (permission and menu rows) — R2` |
| 5 | Met by design: three lists on `ModuleListScaffold`, three forms on `RoutedFormScaffold`, `formatApiError`, the four states (§4) |
| 6 | N/A: nobody is notified |
| 7 | Met by design: refresh on return (B3; `refresh_on_return_test.dart`) |
| 8 | Met by design: `colorScheme` only; screenshots in light and dark |
| 9 | `Waived: 9 (automated e2e), the feature's API and frontend manual cases written now — R12` |
| 10 | Met by design: both manuals and the smoke guide (§6) |
| 11 | Met by design: the admin changelog entry |
| 12 | Walked in §6 |
| 13 | Met by design: every field is a `FieldSpec`; the drift linter passes |
| 14 | N/A: no new enumerable set (`BuildingType` exists; its screen is R11) |
| 15 | Met by design, in full: §5 |
| G1 | §4's table, with its results, in the PR |
| G2 | Screen-reader names and ×1.4 (`venues_accessibility_test.dart`); Tagalog with P0-14 |
| G3 | N/A: admin side only (the pipeline's G3, offline shopper and position privacy) |
| G4 | B2 and B8 recorded in FF-1's `plan.html` row, with the PRD and Blueprint notes (§6) |

dod-reviewer checks every item, and the owner signs it off. "Met by design" becomes "met" only with pasted evidence.

## 10. Scale (spec §5)

- About 100,000 m² per site and about 5 tenants (PRD §7).
- Server paging, default 25 and capped at 200, serves any count (B12).
- No count target is set or tested beyond paging.

## 11. Risks

- **The savepoint wrapper is load-bearing.** A service that reached the real `withTransaction` in a test would commit test rows (L151).
  - *Mitigations:* `savepointDb.test.js`; a review that no FF-1 test builds `createApp` over `openRolledBackDb()` directly; and no concurrent requests through it (§2.5).
- **The lock is proved by review, not by a timing test** (§2.5). A missed `lockVenue` call on a new write path would let two writes race.
  - *Mitigation:* dod-reviewer checks that every level write and both deletes call it.
- **The go_router observer behaviour is RECALLED** (DC-12). `refresh_on_return_test.dart` proves it first, and the fallback is named.
- **Client-side hiding is not security.** Any role can still write through the API until R2 (AC-31). The ledger rows say so, and E-20's localhost-only rule bounds the risk.
- **A placeholder boundary.** FF-3 must refuse a zero-size boundary, and FF-10 replaces the rectangle; the G4 note records both.
- **FF-SK timing.** The client half waits for FF-SK (B15).
- **Machinery built twice.** `ColKind.decimal`, refresh on return, delete and `canWrite` are minimal versions that R11 and R8 extend. The S9 report warned that this migration tends to be skipped; R13 fails without it.
- **The trial roughly doubles the server half's cost.** Accepted by B13 and L62.
- **A later FK into `Level`** fails `foreignKeyInUse.test.js` until it has a noun. That is intended: it is the reminder.
