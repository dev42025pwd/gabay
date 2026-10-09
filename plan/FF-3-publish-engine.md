# FF-3-publish-engine — P0-03: the publish engine, the publish route and the publish screen (E-20)

> **Version**: 1.0 | **Date**: 2026-10-09 | **Status**: APPROVED by Genesis Perez, 2026-10-09 (the FF-1 to FF-4 batch, L156; `plan/FF-1-4-decisions.md`); stage B waits for FF-S2's report | **Spec**: `spec/P0-03.md` r2 (76 AC, 42 edge cases; Q1–Q17 all ruled) | **Intent**: `intent/P0-03-publish-engine.md` | **Parent**: `plan/PH4-feature-first.md` 1.0 §4, row FF-3 (L153, EXCEPTIONS E-20) | **Related**: `plan/SPIKE2-package-routing.md` 1.0 (FF-S2; its report gates the package writer), `plan/FF0-dev-stub-lookups.md` 1.0 (L154), `plan/FF-SK-dashboards.md` 1.0 (the Publish module in the registry), `spec/P0-04.md` r2, `spec/P0-06.md` r2, `spec/P0-02.md` r2 | **Approver**: Genesis Perez, product owner
>
> **Rulings applied:** the spec's Q1–Q16 (batch D1–D16, A3, A5, A8, A9, E10), the plan's four 0.9 questions (A8, A9, D16, D8) and Q17. All are listed in §10. Nothing is open (§13).

## 1. What FF-3 delivers

On localhost, a mall admin opens a venue in the admin page and presses **Publish**. The API then does one of two things:
- **Refuses.** It returns every problem found (and every warning), each with its level and its element or location. The screen lists them and shows each one on a flat map of its level.
- **Publishes.** It generates the walkway graph, costs the connectors, joins the walk-through stores, marks the passages, and writes one immutable package file to a git-ignored local folder. It records the file in `StoredFile` and the version in `VenueVersion` (`PUBLISHED`, with its SHA-256).

Three parts, three coders:
- **The engine** (engine-coder): validation, graph generation, connector costing, walk-through stores and passages, a format-independent package model, and (after Spike 2) the package writer.
- **The API** (api-coder): the draft snapshot, the `VenueVersion` state machine, the storage interface with its local-folder implementation, the routes behind FF-0's dev stub (publish, latest, the level drawing), the development publish command, and the seed's re-seed stop (AC-76). No `AuditLog` row until R3.
- **The admin screen** (flutter-coder): the publish screen, the problem and warning lists, and the read-only flat map with the problems (and, after a publish, the walkways) drawn on it.

Nothing runs on a phone. Download and routing are FF-4 (P0-04, P0-06).

## 2. Stages: what starts now and what waits for Spike 2

Ruled D1 and A5: everything except the package writer's format starts now (stage A); FF-S2 reports before stage B, and stage B cites the report.

**The seam that makes this possible** (DC-P1): the engine ends in a **package model**, a plain in-memory object with the allow-listed rows, the graph (nodes, edges), the passages, the wall segments, the resolved `routing.*` settings and the metadata. A `PackageWriter` port turns the model into bytes. Stage A builds everything up to the model, plus the storage, the version state machine, the routes and the screen. Stage B writes the bytes.

### Step 0 (engine-coder, before anything else): the `better-sqlite3` check

The spec tags this RECALLED (r2 §2). What was checked for this plan, on 2026-10-09:
- **Registry** (`npm view better-sqlite3@13.0.3`, run under Node 22.23.3): `13.0.3` is the latest 13.x and the `latest` tag; `engines.node` is `>=22`; `gypfile: false` and no `install` script (13.0.0 and 13.0.1 had `install: node-gyp rebuild`; 13.0.2 on do not); `exports` lists per-platform entries including `./win32-x64` and `./linux-x64`; unpacked size about 27 MB; one dependency, `node-addon-api ^8.0.0`. *Inference, not yet proved:* the binaries ship inside the package for each platform, so no compiler is needed on Windows or on CI's Linux.
- **Docs** (`docs/compilation.md` in the WiseLibs repository, fetched 2026-10-09): the bundled SQLite is 3.53.4, compiled with `SQLITE_ENABLE_FTS5` and `SQLITE_ENABLE_RTREE`.

What step 0 does and pastes:
1. In engine-coder's working copy, under Node 22: `npm.cmd install better-sqlite3@13.0.3 --save-exact` in `functions/`.
2. A one-off check (not committed): open an in-memory database; create one `fts5` and one `rtree` virtual table; insert and query a row in each; print `sqlite_version()`.
3. Paste the install output, the check's output and the exit codes into the stage A1 PR.
4. If it fails (no binary for Node 22 on Windows, or FTS5 or R*Tree missing), stop and return `## Questions for the user`. Do not fall back to another library: E-03 names this one.

### Stage A: starts now (needs FF-0 merged; the screen also needs FF-1 and FF-SK)

| Part | Coder | Delivers |
|---|---|---|
| A1 | engine-coder | Validation (AC-11 to AC-23), graph generation (AC-24 to AC-32), connector costing (AC-33 to AC-36), walk-through stores and passages (AC-37 to AC-40), the node-count warning (AC-75, nodes), and the package model, including connector names (AC-70), the wall segments (AC-71), the `routing.*` values (AC-72), the venue frame and each node's level ordinal (§3, E10). Pure functions over a `VenueDraft` (§3). No database, no file. |
| A2 | api-coder | The draft snapshot reader; the settings keys and the constants file; the storage interface with its local-folder implementation (AC-50, AC-51); the `VenueVersion` state machine (AC-1 to AC-10, AC-55); the three routes (§4.5), the drawing route without walkways (AC-73, AC-74). All tested with a test writer that emits fixed bytes. The routes are **not mounted** in `routes/api.js` until stage B, so `main` never has a publish route that cannot write a package. |
| A3 | flutter-coder | The publish screen and its view model against the response contract in §4.5 (AC-57 to AC-60, AC-62 to AC-65), tested with a fake service. The registry's Publish module stays "not built" (FF-SK's placeholder) until stage B. |

### Stage B: waits for the Spike 2 report and your rulings on it

**Exactly what waits:**
1. The container: SQLite as D6 ruled, or a change if M7 (FlatBuffers) reopens D6.
2. The CSR graph's layout and number types (D6 cites `Float32List`/`Int32List`), including how each node's level ordinal is stored.
3. Whether the stored file is gzipped. **The hash rule does not wait** (AC-4, agreed with P0-04 AC-6): `PackageSha256` = `StoredFile.Sha256` = the SHA-256 of exactly the bytes the storage holds, which P0-04's package route returns unchanged, with no HTTP-level re-encoding. Only `MimeType` and the phone's unzip step depend on the answer.
4. The FTS5 tokenizer and the R*Tree configuration, the wall-segment index included (AC-71).
5. How much geometry detail the package carries (simplification, if any).
6. The value of `publish.nodeSpacingM` (provisional until then), and so the AC-32 and AC-69 figures.
7. `PackageFormatVersion = 1`, assigned when the writer merges.
8. The stale-build limit's value (D3): sized from the time a full Aurora publish takes, which needs the writer.
9. The package-size warning (AC-75, size): it needs the bytes.

| Part | Coder | Delivers |
|---|---|---|
| B1 | engine-coder | The package writer, format 1 (AC-41 to AC-46, AC-48, AC-70 to AC-72 in the file), a test-only reader that decodes it, and the walkway extraction for the drawing route (AC-61, AC-73). |
| B2 | api-coder | First, the seed's re-seed stop (AC-76), before anything can publish into a development database. Then: the real writer wired in; the package-size warning (AC-75); the routes mounted in FF-0's "admin features (E-20)" group; the walkways part of the drawing route; the development publish command (AC-68, Q17); the seeded-venue publishes (AC-66 to AC-68, needs FF-2 merged); the synthetic-venue measurement (AC-69); the stale limit's value. |
| B3 | flutter-coder | The walkways layer on the map (AC-61); the registry's Publish module flipped to built (FF-SK §2); final screenshots. |

## 3. The engine (engine-coder)

**Where** (Blueprint §2.3, §4.1): `functions/src/services/engines/`. One responsibility per file:
- `publishEngine.service.js`: the entry. `runPublishEngine(draft, settings)` returns `{ problems, warnings, model }`. It runs the steps in AC-1's order and never stops at the first problem (DC-1).
- `draft.js`: parses the database-shaped rows once (`DECIMAL(9,3)` strings to numbers, EC-34) and orders every list by id (DC-3).
- `geometry/`: in-house planar helpers: shape reading (AC-18), point in polygon with "on the line is inside" (DC-12), segment crossing, segment distance, and a uniform bucket index per level (DC-P4).
- `walls.js`: builds each level's wall segments once (ruled D4: every edge of a non-walkable unit's outline except where one of its openings sits, plus the outlines of `BlocksWalk` floor objects). The validator, the graph generator and the package model all use this one list, so AC-71's index holds exactly the segments the validator used.
- `validation/`: one file per check: `reviewGate.js` (AC-11), `wallCrossing.js` (AC-12), `reachability.js` (AC-13, AC-14, D5), `connectors.js` (AC-15, D7), `boundary.js` (AC-16), `beacons.js` (AC-17, D9), `shapes.js` (AC-18), `tenantRefs.js` (AC-19), `noBeacons.js` (AC-22, D8: "No beacons on this level" only), `doorWidths.js` (AC-23), `graphSize.js` (AC-75, the node count).
- `graphGenerator.service.js`: the walkable area and the walk graph (AC-24 to AC-32).
- `connectorCosting.js` (AC-33 to AC-36), `storeCrossings.js` (AC-37, AC-38), `passages.js` (AC-39, AC-40).
- `packageModel.js`: builds the model from the allow-list (`packageAllowList.js`, r2 §3.7, ruled D11 with A3 and A9).
- Stage B: `packageWriter.sqlite.js` (behind the `PackageWriter` port) and, for tests only, a reader.

**One frame, and each node's level ordinal** (ruling E10; P0-06 r2 §3 item 2 and AC-36):
- Every x, y in the draft and in the package is in the venue's one planar frame, in metres, shared by every building and level. The package's metadata states this (a frame field, "venue, metres").
- Each node in the model carries its level id **and its level's `Ordinal`**. P0-06 r2 AC-36 derives the A* estimate from `|ordinal(n) − ordinal(d)|` and each edge's "level span", so the ordinal is written per node, not left for the reader to join. How it is stored is stage B's layout (§2 item 2); that it is stored is fixed now.

**How the graph is generated** (DC-P3; L32 says "generated from the walkable area plus corrections", nothing more):
1. **Walkable test.** A point is walkable if it lies in an `IsWalkable` unit and in no non-walkable unit, no `BlocksWalk` floor object and no `BLOCK_AREA` correction (AC-24).
2. **Nodes.** A square grid per level at `publish.nodeSpacingM`, in the venue frame (E10), keeping walkable points. Grid order is row-major per level, levels by (`Ordinal`, `LevelId`), so node ids are deterministic (AC-31).
3. **Walk edges.** Each node joins its 8 neighbours and the 8 knight's-move neighbours (16 in all) where the straight segment stays walkable and crosses no wall (D4). Cost = length in metres (AC-29). The worst-case detour is about 2.7% over a straight line (1/cos 13.3°), against about 8.2% with 8 neighbours.
4. **Doors.** Each `Opening` of a place's unit becomes a door node at its gap's midpoint, joined through the gap to the nearest walkable nodes on the outside (AC-25). Each venue entrance is a node (AC-25). Inside a store, the door joins the place, not a grid.
5. **Connectors.** Each connector end and lift stop is a node joined to the nearest walkable nodes it can see without crossing a wall; one that cannot join is AC-15(c) (AC-26).
6. **Corrections** as DC-6: `BLOCK_AREA` in step 1; `ADD_PATH` adds its segments, each end snapping to the nearest node within `publish.addPathSnapM`, else it is an orphan (AC-14); `REMOVE_PATH` removes every edge its line crosses (AC-27). `ADD_PATH` runs through the wall check (AC-12).
7. **Same-height joins** (D6): between levels of equal `ElevationM`, node pairs no further apart than the node spacing, whose segment lies in the union of both walkable areas, are joined by a walk edge across the two levels (AC-28).
8. **Clearance** (AC-30): twice the shortest distance from the edge to any wall segment, found through the bucket index; a door edge takes the smaller of that and `ClearWidthM`, and a NULL width raises AC-23's warning.
9. **Connector edges** (AC-33, AC-34, D7): `CostBaseM + CostPerRiseM × rise` from the connector's type row as resolved by the snapshot (the tenant's own row, else the platform's). For stairs, escalators and ramps the rise is `RiseM`. For a lift the rise is the difference of the two stops' `ElevationM`, and an edge joins every pair of stops. A one-way connector gets From → To only. Evacuation-only connectors are in the graph with their flag (AC-35). Each connector carries its `Name` and `SpokenName` (AC-45, AC-70).
10. **Store crossings** (AC-37, AC-38): for each `PassThrough` unit, its doors each join a point just inside, and those points join each other. The edge carries the unit id, its real length, and cost = length × `routing.storeCrossingFactor`.

**Reachability** (AC-13, ruled D5): on the directed graph with walk, door, same-height and everyday connector edges (no evacuation-only edges, no store crossings), a forward search from every entrance and a backward search to every entrance. An occupant counts as reached if at least one of its doors is reached both ways; an amenity, transit point or anchor at its own position. A nested section with no reachable door of its own uses its parent's doors. An orphan (AC-14) is a connected part of the walk graph that holds no entrance.

**Passages** (AC-39, ruled D10): the walk graph without store crossings falls into parts. Each walk-through store whose doors sit in two or more parts is a link between them. A place whose part is not the entrance's is reachable through stores if the part graph joins them. Every store that lies on some simple path between the two parts in the part graph becomes a passage for that place (so both of two alternatives do). The part graph is small, so the paths are found directly. A place that no part path reaches is unreachable (AC-40).

**The `VenueDraft` contract** (fixed here, so A1 and A2 can work in parallel): `{ tenant: { tenantId, beaconProximityUuid }, venue, buildings, levels, units, openings, floorObjects, occupants, amenities, transitPoints, anchors, connectors, connectorStops, beacons, corrections, lookups: { connectorTypes, amenityTypes, occupantCategories, storeStatuses, objectTypes }, settings: { routing: {…}, publish: {…} } }`. Each row is as `pg` returns it from the tables in `db/schema.sql` 0.14, with lookup rows carrying their `TenantId` (for AC-19) and their `IsActive` (unused by the engine: an inactive referenced row is still used, AC-36). `settings.routing` holds every `routing.*` key listed in `settings.js`, resolved for the tenant (AC-72); the model copies it whole and nothing else. A1's tests build drafts with a fixture builder of invented data (`functions/test/fixtures/draftBuilder.js`).

**Problem and warning shape** (DC-11, DC-P9): `{ kind, severity: 'problem' | 'warning', levelId, element: { table, id, name } | null, at: { x, y } | null, segment: [[x, y], [x, y]] | null, params }`. `kind` is from a closed set in the constants file (EC-36). The warning kinds are exactly AC-22's, AC-23's and AC-75's (EC-6). The screen words each kind from ARB; the API also adds an English `message` for the manual and the command line.

## 4. The API (api-coder)

### 4.1 The draft snapshot (`functions/src/services/venueDraft.repository.js`)
- One read-only transaction at `REPEATABLE READ` (DC-2, DC-P6), so every table is read at the same moment (AC-8).
- Every query binds the tenant from the caller's `tenantId` (from `req.tenantCompanyID`) and the venue id (rule 2, AC-52; the `tenant-predicate` lint applies).
- Lookups referenced by the venue's rows are read by id with `(TenantId = $1 OR TenantId IS NULL)` and **no `IsActive` filter** (the global-lookup trap; AC-36). A referenced row of another tenant is read by id without the tenant predicate only to report AC-19; the plan names that one query, and its comment cites AC-19 so review can see why.
- Beacons: only the venue's own rows (DC-P13). Platform-wide uniqueness stays with `UQ_Beacon_Identity` and `FK_Beacon_Namespace`; AC-17's check runs on the draft.
- Settings: every `routing.*` key in `settings.js` and every `publish.*` key, resolved for the tenant through `settings.js` (§4.4; AC-72).

### 4.2 The version state machine (`functions/src/services/venueVersion.service.js`)
DC-P5, "claim first":
1. **Claim** (transaction 1): lock the venue row with `SELECT … FOR NO KEY UPDATE`, tenant-bound; 404 if it is not the tenant's. `FOR NO KEY UPDATE`, not `FOR UPDATE`, so draft edits that insert rows under the venue are not blocked (the same fix FF-1's server review made, batch §G item 4). If a `BUILDING` row exists and is younger than `publish.buildingStaleS`, answer 409 "A publish is already running for this venue" (AC-7). An older one is set to `FAILED` (AC-10; UPDATE of a non-`PUBLISHED` row is allowed by the trigger). Insert `BUILDING` with `VersionNo` = highest + 1 (DC-8), `PackageFormatVersion` = the format constant, `CreatedBy` from the actor. Commit, so another request and a reloaded screen see it (AC-62).
2. **Snapshot** (§4.1), then **engine** (§3).
3. **Refused:** delete the `BUILDING` row (allowed: it is not `PUBLISHED`), so a refusal leaves no row of any status (AC-2, D3), and return the problems.
4. **Build:** the writer makes the bytes; SHA-256 over exactly those bytes (AC-4); the storage `put` writes to a temporary name and renames it into place, never overwriting (DC-P7).
5. **Finalize** (transaction 2): insert `StoredFile` (`Purpose = 'PACKAGE'`, tenant, `MimeType`, `SizeBytes`, `Sha256`, `StoragePath` = the key) and update the row to `PUBLISHED` with the file id, hash, counts, `PublishedAt` (UTC), `PublishedBy` (AC-3).
6. **Failure after the claim** (AC-9, EC-32): remove any written file, set the row `FAILED`, log with the request id, answer 500 in the standard shape. The latest `PUBLISHED` row is untouched.
7. No `AuditLog` row (AC-55; E-20, R3).

**Testing under L151** (rolled-back transactions only): the service takes its transaction runner by injection. Tests pass a savepoint runner over `openRolledBackDb()`'s one connection (`SAVEPOINT` / `RELEASE` / `ROLLBACK TO`), so nothing is ever committed. **Two requests never run at the same time on that connection** (as FF-1's review also states): the AC-7 test pauses the first publish at a test hook placed *between* its transactions (after the claim's savepoint is released, before the snapshot), sends the second request and lets it finish (409), then releases the first. So the two requests' savepoints never interleave. The isolation level of the snapshot is asserted with a fake database (two connections cannot share one rolled-back transaction); see §11.

### 4.3 Storage (`functions/src/services/storage/`)
- `packageStore.js`: the interface `{ put(key, bytes), get(key), exists(key), remove(key) }` (AC-51, DC-13). The engine never touches files.
- `localPackageStore.js`: under the folder named by `PACKAGE_STORE_DIR` (`.env`, documented in `.env.example`; default `.local-packages/` at the repository root, added to `.gitignore`). No Cloud Storage client (AC-50).
- **Key** (ruled D2, DC-P7): `packages/<tenantId>/<venueId>/v<versionNo>-<sha256>.<ext>`. It holds the tenant id and the venue id and is never a disk path (AC-50). The hash in the name stops a collision after `npm run setup-db` restarts the ids.
- The swap to Cloud Storage at the deploy call is a retrofit-ledger row (§8).

### 4.4 Settings and constants
- **`settings.js` DEFAULTS gains** (each listed before use, invariant 16; names are DC-P12):
  - `routing.storeCrossingFactor`: 1.25 (L92 ruling 6; AC-37). A `routing.*` key, so it travels in the package (AC-72).
  - `routing.stepFreeMinWidthM`: 1.2 (L88; r1 Q12's list, ruled D11). Travels in the package; first read by P0-07.
  - `routing.stairsSaveM`: exists (144). Travels in the package (AC-72; P0-06 r2 AC-18).
  - `publish.nodeSpacingM`: provisional 1.5 until stage B. At about 40% walkable floor, a 100,000 m² venue gives roughly 40,000 m² / 2.25 m² ≈ 17,800 nodes, inside PRD §7's ~20,000. Measured in AC-69.
  - `publish.addPathSnapM`: provisional, equal to the node spacing (DC-6).
  - `publish.buildingStaleS`: provisional 900 s until stage B sets it to three times the measured Aurora publish (D3), reported to you.
  - `publish.maxNodesWarn`: 20,000; `publish.maxPackageBytesWarn`: 3,000,000, measured on the gzipped bytes (AC-75, D14: warnings, never refusals). If Spike 2 rules the stored file not gzipped, the service gzips a copy in memory only to measure it.
  - **Not added:** coverage-gap and near-collinear keys. D8 ships only "No beacons on this level" until Spike 1's figures exist.
  - `package.refreshCheckS` is P0-04's key (A3) and never enters the package (AC-72's negative case).
- **The constants file** `functions/src/config/constants.js` (DC-P14), each set with its authority comment (FEATURE_PIPELINE §5 item 14): problem kinds, warning kinds, edge kinds, `VenueVersion` statuses, the `PACKAGE` purpose, the format version.

### 4.5 Routes (in FF-0's "admin features (E-20)" group, behind `devStub.js`; mounted in stage B)
| Route | What it does |
|---|---|
| `POST /api/venues/:venueId/versions` | Publish. **201** `{ outcome: 'published', version: { versionNo, publishedAt, sizeBytes, sha256, nodeCount, edgeCount, formatVersion }, warnings: [...] }`; **200** `{ outcome: 'refused', problems: [...], warnings: [...] }` (DC-P8); 409, 404, 400, 500 in the standard `{ error }` shape |
| `GET /api/venues/:venueId/versions/latest` | `{ published: {…} \| null, building: { startedAt } \| null }` (AC-57, AC-62) |
| `GET /api/venues/:venueId/levels/:levelId/drawing[?versionNo=n]` | Ruled D16 (AC-73). The level's draft units and openings (including those that still need review), connector ends and lift stops, and active beacons, each with its id and geometry in level metres. With `versionNo`, also that version's walkways on the level (walk, connector and store-crossing edges), read from its package through the storage interface (stage B). One level per response (EC-37) |

- `:venueId`, `:levelId` and `versionNo` must be positive integers up to 2,147,483,647, else 400 (AC-56, AC-74); nothing reaches SQL as text (rule 3).
- The tenant comes only from `req.tenantCompanyID` (rule 2). 404, with no data: a venue or level of another tenant (AC-52, AC-74); a level not in the named venue; a `versionNo` that names no `PUBLISHED` version of the venue, before any publish or for a `FAILED` one (AC-74, EC-42).
- The outlines are always the draft's; the walkways are version n's. They may differ after a later edit (EC-39); that is expected.
- The client's publish call uses its own receive timeout, `kPublishReceiveTimeout` (5 minutes; DC-P11), because the default is 30 s (`api_client.dart`, `kReceiveTimeout`) and D3 makes the request wait.

### 4.6 The development publish command (stage B; ruled D13 and Q17)
- `npm run publish:dev -- <TENANT_CODE> [<VENUE_CODE> | --all]` (DC-P17). It calls `venueVersion.service.js` directly, acts as `DEV_STUB_USER_EMAIL`, binds each venue's own tenant in every query (EC-38), and prints each venue's outcome with its problems in English.
- **Unknown codes (Q17, ruled):** it checks the tenant code and the venue code before publishing anything. An unknown one is named in one line, nothing is published, and it exits non-zero.
- **Exit codes** (DC-P18): 0 when every venue named was published; 1 when any was refused or failed (AC-68); 2 for an unknown code or bad arguments, with nothing published (Q17).
- It refuses to run unless `NODE_ENV` is explicitly `development` or `test`, using FF-0's shared constant.
- Added to CLAUDE.md's Commands and README (sync table, command row).

### 4.7 The seed's re-seed stop (B2, first; ruled A8, AC-76)
- `db/seeds/seed.js`, before it deletes anything: if any `VenueVersion` row (any status) belongs to its two seeded tenants, it changes nothing, prints one line telling the user to run `npm run setup-db`, and exits non-zero. It never switches off or bypasses `TR_VenueVersion_Frozen`.
- The check is one function (`db/seeds/lib/versionGuard.js`) so a test can run it on a rolled-back connection with a version row inserted, and show nothing changed.
- The seed README states the rule and the recovery: `npm run setup-db`, then `npm run publish:dev -- <TENANT_CODE> --all`.
- This touches FF-2's files. If FF-2 is still open when B2 starts, the main session asks you which branch takes it.

## 5. The admin screen (flutter-coder)

**Where:** `app/lib/features/admin/publish/{models,services,viewmodels,views}/` (Blueprint §2.3's fixed shape).
- **Entry** (AC-57): a "Publish" action on FF-1's venue screen. The registry's Publish module (FF-SK §2) opens the same screen for a chosen venue.
- **Summary** (AC-57): the latest published version (number, date and time, size, node and edge counts, the first 12 characters of the SHA-256) or "Not published yet".
- **Pressing Publish** (AC-58): the button disables and a progress state shows; then success (summary plus warnings) or "Not published" with the problems.
- **Already running** (AC-62): if `latest` shows `building`, or the press gets 409, the message shows and the button stays disabled until a refresh finds no build running. A receive timeout re-reads `latest` instead of reporting failure.
- **Lists** (AC-59): problems and warnings grouped by kind, each row a plain message (ARB, from `kind` and `params`) and its level. They use S9's `ModuleListScaffold` with all four states, paged on the client over the response (DC-P10). Tapping a row opens the map on that level with the item highlighted.
- **Map** (AC-60, ruled D12): `flutter_map` with `CrsSimple`, read-only, one level at a time with level chips, drawn from the drawing route (AC-73). It draws units, doors, connectors, beacons and the markers. Colours only through `colorScheme` from `gabay_tokens.dart` (rule 6). Stage B adds the walkways of the latest published version (AC-61).
- **Errors** (AC-63): through `formatApiError`, with a retry. Messages through the shared messaging component (the `no-snackbar` lint).
- **Return** (AC-64): the venue screen refreshes its version information on `didPopNext`.
- **Roles on the client** (FF-SK §2 and its ruling 1, approved): VIEWER sees the screen read-only, with no Publish button; VENUE_EDITOR has no Publish module in its menu. The server enforces nothing until R2 (AC-54).
- **Accessibility and wording** (AC-65): screen-reader names on every control, no overflow at ×1.4 at 320 px, every phrase in `app_en.arb` with a description. English now; Tagalog with P0-14 (A4).
- **No form fields**, so no `FieldSpec` (item 13). If one is added, it is a `FieldSpec`.

## 6. Tests first, and traceability

Every test is written failing first where it can be. API tests write real tables only inside an always-rolled-back transaction (L151); package files go to a temporary folder per test, removed afterwards. Fixture venues are invented; no penthouse data anywhere (L48), and Demo Malls data only as seeded in the database.

**Test files.** Engine (engine-coder): `engine.draft`, `engine.geometry`, `engine.walls`, `engine.validation`, `engine.graph`, `engine.costing`, `engine.passages`, `engine.model`; stage B `engine.packageWriter`, `engine.packageSeal` (all `functions/test/*.test.js`). API (api-coder): `storage.localPackageStore`, `venueVersion.service`, `publish.snapshot`, `publish.api`, `drawing.api`, `constants`; stage B `publish.seeds`, `publish.scale`, `devPublish`, `db/seeds/test/versionGuard.test.js`; `tools/test/package-dir-ignored.test.js`. Flutter (flutter-coder, `app/test/features/admin/publish/`): `publish_view_model_test`, `publish_screen_test`, `publish_map_test`, `venue_publish_entry_test`, plus cases added to `app/test/screenshot_test.dart`.

| AC | Test (stage) | | AC | Test (stage) |
|---|---|---|---|---|
| 1 | `venueVersion.service` order of steps, both outcomes, the request waits (A); `publish.seeds` end to end (B) | | 39 | `engine.passages` (A); a seeded venue if it has one, else fixture only (B) |
| 2 | `venueVersion.service` + `publish.api`: no row of any status, no file, every problem with kind, level, element or location (A) | | 40 | `engine.passages` (A) |
| 3 | `venueVersion.service` row fields (A); format version 1 (B) | | 41 | `engine.packageWriter`: read-only open, `integrity_check`, FTS5 and R*Tree work (B) |
| 4 | `venueVersion.service`: `PackageSha256` = `StoredFile.Sha256` = hash recomputed from the stored bytes (A); real package (B) | | 42 | `engine.packageWriter`: decoded CSR equals the generator's output (B) |
| 5 | `venueVersion.service`: publish twice, row 1 unchanged; a direct `UPDATE` raises the trigger's error (A) | | 43 | `engine.packageWriter` fixtures (B); `publish.seeds` Aurora "comfort room" and "cr" (B) |
| 6 | `venueVersion.service`: version 1's file hash before and after version 2 (A) | | 44 | `engine.packageWriter` (B) |
| 7 | `publish.api`: first publish paused between its transactions, second gets 409 and creates nothing; two venues both proceed (A) | | 45 | `engine.model` values (A); `engine.packageWriter` (B) |
| 8 | `publish.snapshot`: edit injected at the hook after the snapshot; absent from v1, present in v2 (A) | | 46 | `engine.packageSeal`: package schema equals the allow-list; none of the excluded columns; no non-`routing.*` setting (B) |
| 9 | `venueVersion.service` with a failing store: `FAILED`, no file, 500 shape with request id, latest unchanged (A) | | 47 | `engine.model` (A); `engine.packageWriter` (B) |
| 10 | `venueVersion.service`: an old `BUILDING` row is failed and the publish proceeds; limit injected (A); value sized from Aurora (B) | | 48 | `engine.packageWriter` metadata table, the frame field included (B) |
| 11 | `engine.validation` (A); `publish.snapshot` MEZZ's `NeedsReview` doors each listed (A) | | 49 | `engine.model` on a two-venue draft (A); `publish.seeds`: other venues' names and beacon identities absent (B) |
| 12 | `engine.walls` + `engine.validation`: through a wall, through a blocking floor object (refused), through a door gap (allowed) (A) | | 50 | `storage.localPackageStore`: key holds tenant and venue ids, never a path (A); `tools/test/package-dir-ignored` (`git check-ignore`) (A); `publish.seeds` `StoredFile` row (B) |
| 13 | `engine.validation`: each D5 condition (A); `publish.seeds` (B) | | 51 | review; `storage.localPackageStore` (A) |
| 14 | `engine.validation` (A) | | 52 | `publish.api`: other tenant's venue is 404, nothing created (A) |
| 15 | `engine.validation` (a)–(d), a lift with no `RiseM` passes (A); `publish.snapshot` one seeded connector (A) | | 53 | `publish.api`: `X-Tenant-Id` not held is 403 (A) |
| 16 | `engine.validation` incl. on-the-line (A) | | 54 | **Not tested in FF-3:** deferred to R2, e2e in R12; ledger row (§8) |
| 17 | `engine.validation` in memory; two levels sharing a Major are not flagged (A) | | 55 | `venueVersion.service`: `AuditLog` count unchanged; `CreatedBy`, `PublishedBy` = stub user (A) |
| 18 | `engine.geometry` each bad shape (A) | | 56 | `publish.api`: `abc`, `-1`, `1.5`, `2147483648` each 400 (A) |
| 19 | `engine.validation` (A); `publish.snapshot` another tenant's `ConnectorType` (A) | | 57 | `venue_publish_entry_test`, `publish_screen_test`, screenshot (A) |
| 20 | `engine.validation` (A) | | 58 | `publish_view_model_test`, `publish_screen_test` (A) |
| 21 | `engine.validation`: one fault of each kind, all listed (A) | | 59 | `publish_screen_test`: grouping, four states, tap opens the level (A) |
| 22 | `engine.validation`: "No beacons on this level" per level with no active beacon, and no other beacon warning (A); `publish.seeds` every Demo Malls level (B) | | 60 | `publish_map_test` from a fake drawing response; screenshots light and dark, phone and tablet (A) |
| 23 | `engine.validation` (A) | | 61 | `publish_map_test` walkways layer (B) |
| 24 | `engine.graph` property test: every node and edge inside the walkable area (A) | | 62 | `publish_view_model_test`: `building` on open, 409, timeout re-read (A) |
| 25 | `engine.graph` (A) | | 63 | `publish_view_model_test`: offline, API down, 500 (A) |
| 26 | `engine.graph` (A) | | 64 | `venue_publish_entry_test` (A) |
| 27 | `engine.graph` each correction kind (A) | | 65 | `publish_screen_test` names and ×1.4 at 320 px (A) |
| 28 | `engine.graph` fixture (A); `publish.seeds` Meridian and Aurora (B) | | 66 | `publish.seeds`: the four Demo Malls venues publish, warnings only (B) |
| 29 | `engine.graph` (A) | | 67 | `publish.seeds` MEZZ refused with its doors (B); penthouse by hand, Smoke guide row |
| 30 | `engine.graph` incl. NULL width (A) | | 68 | `devPublish` over the seeded tenants, exit 0 and 1 (B) + Smoke guide row |
| 31 | `engine.graph`: generate twice, identical (A) | | 69 | `publish.scale`: time, peak memory, size raw and gzipped, counts printed and pasted in the PR; no gate (B) |
| 32 | `engine.graph` spacing is a setting (A); `publish.scale` count (B) | | 70 | `engine.model`: each connector's `Name` (A); `engine.packageWriter` (B) |
| 33 | `engine.costing` 14 + 1 × 4.5 = 18.5, tenant-tuned, lift pairs by `ElevationM` (A) | | 71 | `engine.walls`: the model's segments are the validator's (A); `engine.packageWriter`: the decoded index holds the same segments, none left out (B) |
| 34 | `engine.costing` (A) | | 72 | `publish.snapshot`: a tenant override of `routing.storeCrossingFactor` resolved (A); `engine.packageWriter`/`publish.seeds`: the override in the package, `package.refreshCheckS` absent (B) |
| 35 | `engine.costing` (A) | | 73 | `drawing.api`: outlines incl. unreviewed ones, connector ends and stops, active beacons only (A); with `versionNo`, the walkways (B) |
| 36 | `engine.costing` (A); `publish.snapshot`: a referenced `ConnectorType` deactivated in the transaction, then published (A; runs in verify) | | 74 | `drawing.api`: other tenant's venue or level, level of another venue, unknown or `FAILED` `versionNo` each 404; bad ids each 400 (A) |
| 37 | `engine.passages` crossing edges: unit id, real length, cost × factor (A) | | 75 | `engine.validation` node-count warning, threshold injected (A); `venueVersion.service` size warning, threshold injected (B); `publish.scale` reports whether either fired (B) |
| 38 | `engine.passages` (A) | | 76 | `versionGuard.test`: a version row present, the seed stops, nothing changed (B); Smoke guide row |

**Plan items beyond the spec's ACs** (E10; P0-06 r2 §3 item 2 and AC-36): `engine.model` asserts every node carries its level's `Ordinal` and the metadata states the venue frame (A); `engine.packageWriter` decodes them (B).

| EC | Test or reason | | EC | Test or reason |
|---|---|---|---|---|
| 1 | AC-6's test | | 22 | `engine.validation` (AC-15d); `engine.costing` lift by `ElevationM` (D7) |
| 2 | `publish_view_model_test`; nothing reaches the server, so no server test | | 23 | `engine.validation` (AC-15) |
| 3 | `venueVersion.service`: change a cost and a `routing.*` value after v1, v1's bytes unchanged | | 24 | `engine.validation` (AC-12 incl. a blocking floor object, AC-14, AC-13) |
| 4 | `engine.validation`: no levels; no walkable area | | 25 | `engine.validation`: one-way up only, refused (D5) |
| 5 | `engine.validation`: walkways, no places, publishes with "No beacons" warnings | | 26 | `engine.validation`: evacuation-only stairs as the only way, refused (D5) |
| 6 | `engine.validation`: an empty level adds no node; only "No beacons on this level" | | 27 | `engine.passages` (AC-39, AC-40, D10 both) |
| 7 | `publish.scale` (AC-69, AC-75); `publish.seeds` (AC-66) | | 28 | `engine.graph` (AC-30) + `engine.validation` (AC-23) |
| 8 | `engine.model` long and non-ASCII names (A); `engine.packageWriter` FTS5 finds them (B) | | 29 | `engine.validation`: nested section through its parent's doors; unreachable when the parent is |
| 9 | `engine.validation` 300 unreviewed elements all listed; `publish_screen_test` paging | | 30 | `engine.validation` + `engine.model`: no beacons, inactive beacon left out, duplicate in memory, shared Major not checked |
| 10 | `publish.api` (AC-52, AC-53); `drawing.api` (AC-74) | | 31 | AC-36's test |
| 11 | `engine.validation` + `publish.snapshot` (AC-19) | | 32 | `venueVersion.service` failing store (AC-9) |
| 12 | `storage.localPackageStore`: the key holds tenant and venue; `publish.seeds` (AC-49) | | 33 | `venueVersion.service`: two versions, identical graph |
| 13 | MALL_ADMIN is the stub's user in every `publish.api` case; the other roles are R2 (ledger) | | 34 | `engine.draft`: string decimals parsed, never compared as text |
| 14 | Not tested: the venue grant is R1's (ledger) | | 35 | Nothing beyond AC-46's seal (r2): `engine.packageSeal` |
| 15 | `publish.api` (AC-7); `devPublish` against a running publish gets the same refusal (B) | | 36 | `constants`: the kinds are frozen sets; review checks the authority comments |
| 16 | `publish.api` (AC-7) | | 37 | `drawing.api`: one level per response, on Aurora's largest level (B) |
| 17 | `publish.snapshot` (AC-8) | | 38 | `devPublish`: a Spike Venues publish binds that tenant in every query (B; the `tenant-predicate` lint) |
| 18 | `venueVersion.service` (AC-10) | | 39 | `drawing.api`: draft edited after v1; outlines are the draft's, walkways v1's (B) |
| 19 | `publish_view_model_test` (AC-62) | | 40 | `versionGuard.test` (AC-76) |
| 20 | `publish.api` (AC-56, unknown id 404); `drawing.api` (AC-74) | | 41 | `devPublish`: unknown tenant code and unknown venue code each named, nothing published, exit 2 (B; Q17) |
| 21 | `engine.geometry` (AC-18) | | 42 | `drawing.api`: `versionNo` before any publish, and a `FAILED` one, each 404 (A) |

**Existing tests that change:** none, except two that may need a line:
- `app/test/screenshot_test.dart` gains new cases. Nothing in it is edited.
- FF-SK's registry test, if it pins Publish's "built" flag: B3 flips it, because P0-03 delivers the module (FF-SK §2: "a slice that delivers a module flips one flag").

## 7. Who and order

**Before:** FF-0 merged (the stub and its route group). FF-1 merged before A3 (the venue screen is the entry). FF-SK merged before A3 merges (the registry and the shell). FF-2 merged before B2 (its seed tests and AC-76 touch FF-2's files). The Spike 2 report, and your rulings on it, before stage B.

1. **engine-coder** (its working copy, branch from `main`): step 0, then A1. One PR.
2. **api-coder**, in parallel with A1: A2. One PR. It uses the `VenueDraft` contract in §3, so it does not wait for A1's code; its service tests use a stub engine until A1 merges, then the real one.
3. **flutter-coder**, once FF-1 and FF-SK are merged: A3. One PR. It builds against §4.5's contract with a fake service.
4. **test-verifier** on each stage A PR in the coder's copy; **dod-reviewer** on each; your merge go on each.
5. **Spike 2 reports;** you rule D6 and the format points (§2, "exactly what waits").
6. **engine-coder** B1, then **api-coder** B2 (AC-76 first; then it needs B1's writer), then **flutter-coder** B3. Each its own PR, with test-verifier, dod-reviewer and your go.
7. **Your sign-off** of FF-3 after B3, with the traceability table complete.

`npm run verify` runs before each report, with `GABAY_VERIFY_OWNER` set to the coder's name. Pasted output, ending `ALL GREEN`.

## 8. Records

| Record | Change | Who, when |
|---|---|---|
| Retrofit ledger, `plan/PH4-feature-first.md` §7 | Six rows: the three routes (publish, latest, the drawing route, D16); the publish screen; the storage swap to Cloud Storage (closed at the deploy call, OQ9, D2); the `publish:dev` command (deleted with the stub in R1). Each: stub → R1; guard order R1–R3; permission row R2 (`venue-versions` Create and Read); menu row R2; audit R3 (publish only); validation R5; e2e R12 | Main session, on your go |
| CLAUDE.md sync table | The missing row Blueprint §3.5 says exists: **"`PackageFormatVersion` (the package format) → the format constant in `functions/src/config/constants.js`; Blueprint §3.5 and §4.1's format description; the readers in P0-04 and P0-06 (the versions they accept); a `plan.html` row"** | Main session, on your go |
| CLAUDE.md Commands, README | `npm run publish:dev`, with its exit codes (stage B) | api-coder in B2; main session for CLAUDE.md |
| `db/schema.sql` | `StoredFile.StoragePath`'s comment reworded to "the storage key (`packages/<tenantId>/<venueId>/…`); a local folder under E-20, the Cloud Storage object path after the deploy call; never a disk path" (D2). A source comment only: no migration, no table change. `VenueVersion.PackageFileId`'s comment ("the object lives in Cloud Storage") gets the same note. `db/SCHEMA_READING_GUIDE.md` follows | api-coder in A2 |
| `db/seeds/README.md` | The re-seed rule and its recovery (AC-76, A8) | api-coder in B2 |
| `.env.example`, `.gitignore` | `PACKAGE_STORE_DIR`; `/.local-packages/` | api-coder in A2 |
| `settings.js`, Blueprint invariant 16 | The keys in §4.4 | api-coder in A2; Blueprint by the main session |
| Constants file | New, §4.4 | api-coder in A2 (engine-coder adds kinds in A1 through it) |
| Blueprint | §4.1 as built: local storage under E-20 (D2), the settings, the stages, the drawing route (D16), "No beacons on this level" only (D8); §3.5 the hash rule (AC-4); the one venue frame (E10) and the per-node ordinal; Part 1 `better-sqlite3` row rechecked 2026-10-09 (13.0.3, `engines >=22`, per-platform binaries); format 1 after stage B; OQ9 unchanged | Main session |
| EXCEPTIONS | E-03 unchanged (13.x). E-04's wording widened from "the admin's flat editor only" to "the admin's flat maps" (ruled D12, with your sign-off) | Main session, on your go |
| `app/pubspec.yaml`, Blueprint Part 1 | `flutter_map` 8.x pinned after a pub.dev check at install (the Blueprint's 8.3.2 is from 2026-10-02: RECALLED until rechecked) | flutter-coder in A3 |
| Manuals | `E2E_Test_Cases_Manual.md`: publish, refusal, 409, 404, 403, 400, latest, drawing (with and without `versionNo`). `E2E_Frontend_Test_Cases_Manual.md` and `Smoke_Test_Guide.md`: the screen, a refusal shown on the map, the walkways, the penthouse by hand (AC-67), `publish:dev` incl. an unknown code (AC-68, Q17), the re-seed stop (AC-76) | Each coder for its part |
| ARB, changelog | Every phrase and problem kind in `app_en.arb`; an admin changelog entry (`changelog.dart` + ARB bullet); screenshots | flutter-coder |
| FEATURE_PIPELINE P0-03 | Intent, spec r2, plan 1.0, PRs, status `IN PROGRESS`, then `DONE` (§6). P0-02 stays `IN PROGRESS` until FF-3 publishes the seeded venues (batch C10) | Main session |
| `plan.html` | The FF-3 row in the L156 batch (already in hand); G4 rows for local storage, no audit row under E-20, and D8's missing coverage warnings | Main session |
| P0-04, P0-06 specs | Nothing new: r2 of each already carries the hash rule, A3 and A9. At P0-06's next revision, its §3 item 8 ("now only `routing.stairsSaveM`") lists the two new `routing.*` keys too | spec-writer, at the next revision |

## 9. Design choices (DC-P1 to DC-P17 approved with this plan in the batch, L156; DC-P18 new in 1.0, for your yes)

| # | Choice | Alternative, and when it would be better |
|---|---|---|
| DC-P1 | A format-independent package model and a `PackageWriter` port, so only the writer waits for Spike 2 | Write the D6 SQLite file now (Q1c). Better if Spike 2 were cancelled |
| DC-P2 | The engine is pure functions over a `VenueDraft`; all SQL is api-coder's | The engine reads the database itself. Simpler wiring, but the engine's tests would need the database |
| DC-P3 | Grid sampling with 16 neighbours | (a) 8 neighbours: half the edges, routes up to about 8.2% long; better if Spike 2 finds the package too big. (b) Corridor centrelines (medial axis): fewer nodes and natural lines, but much harder geometry; better if grid routes look poor on the phone |
| DC-P4 | No geometry library: in-house point-in-polygon, crossing and distance with a bucket index | A polygon library pinned in Part 1 with an EXCEPTIONS entry (none named here: RECALLED). Better if DC-P3 moves to centrelines |
| DC-P5 | Claim first (lock the venue `FOR NO KEY UPDATE`, insert `BUILDING`, then snapshot and validate; delete the row on refusal) | Validate first, then claim. Two presses would both validate, and the second might get problems instead of 409 |
| DC-P6 | The snapshot is one `REPEATABLE READ` read-only transaction | `SERIALIZABLE`, or the spec's DC-2 alternative (lock the venue against edits during the build) |
| DC-P7 | The storage key carries the SHA-256; write to a temporary name, then rename; never overwrite | D2's example key without the hash. It collides after `setup-db` restarts the ids |
| DC-P8 | A refusal is a 200 result `{ outcome: 'refused', … }`; errors keep `{ error }` | 422 with the error shape plus a `problems` field |
| DC-P9 | Issues carry `kind` and `params`; the screen words them from ARB (Tagalog later) | English text from the server only. Simpler, but not translatable |
| DC-P10 | The lists page on the client over the response | Server-side paging, which needs stored problems (not ruled: D3 keeps no row) |
| DC-P11 | The publish call has its own 5-minute receive timeout; a timeout re-reads `latest` | Raise the global 30 s timeout; or a background job (not ruled: D3) |
| DC-P12 | The setting names in §4.4 | Other names. `routing.*` for what the phone reads, `publish.*` for what only publish reads |
| DC-P13 | The beacon collision check runs on the venue's own beacons; the platform rule stays with the database constraints | Read every tenant's beacons. That breaks rule 2's binding and the `tenant-predicate` lint |
| DC-P14 | One constants file, `functions/src/config/constants.js` | A constants file per module |
| DC-P15 | The hash covers exactly the stored bytes, which P0-04 serves unchanged | Now required by r2 AC-4; kept here for the record |
| DC-P16 | Routes under `/api/venues/:venueId/versions` and `/levels/:levelId/drawing` | `/api/publish/:venueId`. Less aligned with `venue-versions` as the permission route |
| DC-P17 | `publish:dev` takes a tenant code and a venue code or `--all` | Venue ids. Those change after every `setup-db` |
| DC-P18 | **New.** `publish:dev` exits 0 (all published), 1 (any refused or failed), 2 (unknown code or bad arguments, nothing published) | One non-zero code for every failure. Simpler, but a script cannot tell a typo from a refused venue |

## 10. Rulings applied (2026-10-09, `plan/FF-1-4-decisions.md`)

| Q | Ruling | Where applied |
|---|---|---|
| Q1 | D1: everything except the writer's format now; stage B after FF-S2 | §2 |
| Q2 | A5: FF-S2 reports before stage B (and before FF-4) | §2, §7 |
| Q3 | D2: a git-ignored local folder; a storage key in `StoragePath`; a ledger row closed at the deploy call | §4.3, §8 |
| Q4 | D3: no row on refusal; `FAILED` for build errors only; the request waits; a stale-limit setting sized from Aurora | §4.2, §4.4 |
| Q5 | D4: non-walkable outlines except at their doors, plus blocking floor objects | §3 (`walls.js`) |
| Q6 | D5: all four place kinds, both ways, everyday connectors, no step-free check | §3 (reachability) |
| Q7 | D6: automatic same-height joins | §3 step 7 |
| Q8 | D7: a lift's rise from `ElevationM`; no `RiseM` needed on lifts | §3 step 9 |
| Q9 | **D8: only "No beacons on this level"** until Spike 1's figures exist (not r1's recommended (a); also the plan's 0.9 Q4). Recorded under G4 | §3 (`noBeacons.js`), §4.4, §12 |
| Q10 | D9: no per-floor range check yet | §3 (`beacons.js`) |
| Q11 | D10: both stores become passages | §3 (passages) |
| Q12 | D11 with A3 and A9: the allow-list confirmed; every `routing.*` key and only those; connector names and the wall-segment R*Tree added | §3, §4.4; AC-70 to AC-72 |
| Q13 | D12: `flutter_map`, E-04 widened; walkways drawn after a publish | §5, §8 |
| Q14 | D13: `publish:dev` for any tenant, plus the screen; MEZZ and the penthouse refused until FF-10 | §4.6 |
| Q15 | D14: measure and report; warnings above ~20,000 nodes or 3 MB, never refusals | §4.4; AC-75 |
| Q16 | D15: DC-1 to DC-13 accepted | §3, §4 |
| Q17 | An unknown tenant or venue code is named, nothing is published, and the command exits non-zero | §4.6 |
| Plan 0.9 Q1 | A8: the seed stops with "run `npm run setup-db`" | §4.7; AC-76 |
| Plan 0.9 Q2 | A9: connector names and the wall-segment R*Tree in the package | §3; AC-70, AC-71 |
| Plan 0.9 Q3 | D16: the drawing route, with its ledger row | §4.5; AC-73, AC-74 |
| Plan 0.9 Q4 | D8 (as Q9) | §3 |
| P0-06 Q5 | E10: one planar frame per venue; the package states it, and each node carries its level ordinal (P0-06 r2 AC-36) | §3 |

## 11. Risks

- **Spike 2 reopens D6** (FlatBuffers). Stage B's writer and its tests change; stage A does not, by DC-P1.
- **Grid graphs** may look stepped on the phone, or count more nodes than ~20,000 on a big venue. Measured in AC-69 (a warning, never a refusal, D14) and seen in FF-4. The alternatives are in DC-P3.
- **verify gets slower:** publishing four seeded malls and a 100,000 m² synthetic venue inside `api:test`. UNKNOWN until measured. If it is too slow, the fix comes to you as a question; no test is skipped.
- **A long synchronous publish** may outlast the Functions emulator's request limit. RECALLED: about 60 s by default for an HTTP function; unchecked. Measured on Aurora in B2; if it is over, a background job (D3's other option) comes back to you.
- **The seeds may be refused** once publish runs on them (AC-66). Fixes go into FF-2's seed data, never into a looser check.
- **Snapshot isolation** cannot be proved across two connections under L151 (no committed test data). It is covered by the single-connection AC-8 test, a fake-database assertion of the isolation level, and review.
- **`better-sqlite3`** may not load on this machine despite the registry evidence. Step 0 finds out before any code depends on it. Its behaviour inside a deployed function stays OQ9 (the deploy call).
- **Internal data in package files:** a penthouse package would hold internal-only data. The folder is git-ignored and tested (AC-50); no test uses the penthouse.
- **Three coders and shared ports:** verify runs one at a time (the lock); parallel stage A work waits on it.

## 12. Definition of done (FEATURE_PIPELINE §5)

| Item | For FF-3 |
|---|---|
| 1 Schema and migration | No table or column change. `schema.sql`'s comment on `StoragePath` (and `PackageFileId`) only, with the reading guide; no migration, because no database object changes |
| 2 Seed | `settings.js` defaults; the seed's re-seed stop and its README line (AC-76); seed data fixes that publishing reveals (FF-2's files); the lookups allow-list unchanged (the screen needs no new lookup) |
| 3 | `Waived: 3 (guard order) — the dev stub stands in; R1–R3, checked by R7's route-guard-order lint` |
| 4 | `Waived: 4 (permission and menu rows) — R2` (`venue-versions` Create and Read) |
| 5 Scaffolds, `formatApiError`, four states | Yes: the lists and the errors (AC-59, AC-63) |
| 6 Notifications | Not applicable: no ruling says anyone is told of a publish |
| 7 Refresh on return | Yes (AC-64) |
| 8 Dark mode | Yes: tokens only; screenshots light and dark |
| 9 | `Waived: 9 (automated e2e) — R12`. The API and frontend manual cases are written now |
| 10 Manuals and smoke guide | Yes (§8) |
| 11 Changelog | Yes: the admin surface |
| 12 Sync table | Every row walked in §8. The `PackageFormatVersion` row is added to CLAUDE.md |
| 13 `FieldSpec` | Not applicable: no form field |
| 14 Enumerable sets | The constants file with authority comments (§4.4) |
| 15 Inactive lookup | AC-36's test, in verify |
| G1 | §6's tables, filled with results by test-verifier |
| G2 | Screen-reader names and ×1.4 (AC-65). The Tagalog part is waived to P0-14 (FF-7), as ruled A4 and recorded in the slice row |
| G3 | Not applicable: no shopper feature, no position |
| G4 | `plan.html` rows for local storage, no audit row, and D8 (PRD §6.3's coverage-gap and near-collinear warnings not built yet) |

## 13. Questions for the user

None open. Every question from the spec (Q1–Q17) and from this plan's 0.9 is ruled (§10). The only new item is DC-P18 (the command's exit codes, §9), which needs your yes like any design choice.

## Suggestions (not in scope)

- A "Check without publishing" button that runs validation only (r2 §8).
- A version history list on the publish screen.
- `npm run setup-db` clearing the local package folder, so orphaned files from earlier databases do not pile up (DC-9 keeps every file while E-20 is open).

## Revision history

| Version | Date | Change |
|---|---|---|
| 0.9 | 2026-10-09 | Draft for the L156 batch, on spec r1, assuming each recommended answer |
| 1.0 | 2026-10-09 | Approved in the batch. Cites spec r2. The rulings in §10 applied: D8 replaces the coverage warnings with "No beacons on this level" (`noBeacons.js`; the coverage settings dropped); A8 the seed's re-seed stop (§4.7, B2 first); A9 connector names and the wall-segment R*Tree (`walls.js` shared by the validator and the package); A3 every `routing.*` key in the package; D16 the drawing route with r2's 404 rules; D14's size warnings (AC-75); Q17's unknown-code rule and DC-P18's exit codes; E10's one venue frame and each node's level ordinal (P0-06 r2 AC-36). The venue lock is `FOR NO KEY UPDATE` (as FF-1's review fixed), and the AC-7 test pauses between transactions so savepoints never interleave. Traceability extended to AC-70–AC-76 and EC-37–EC-42. §13's questions closed |
