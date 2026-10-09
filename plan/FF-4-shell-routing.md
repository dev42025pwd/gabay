# FF-4-shell-routing — FF-4: the Map tab, package delivery and the routing engine (E-20)

> **Version**: 0.9 DRAFT | **Date**: 2026-10-09 | **Status**: DRAFT for the product owner's batch approval (L156) | **Spec**: `spec/P0-04.md` r1 (r2 pending: the FF-SK shell and the rulings, §4) and `spec/P0-06.md` r1 (r2 pending: Spike 2's latency target and the rulings, §4) | **Parent**: `plan/PH4-feature-first.md` 1.0 §4, row FF-4 (L153, EXCEPTIONS E-20); builds on `plan/FF-SK-dashboards.md` 1.0 §6 (the shopper shell) | **Approver**: Genesis Perez, product owner
>
> **Traces to:** intents `intent/P0-04-shopper-shell.md` and `intent/P0-06-routing.md`; FEATURE_PIPELINE P0-04, P0-06 and §5; Blueprint §4.2, §4.4, Part 1 invariants 2–6, 8, 15, 16 and `<known_traps>` (tilted tap, heuristic, rise, demo, development stub); EXCEPTIONS E-02, E-20; `spec/P0-03.md` r1 (the package contract, §3.7–§3.8, Q1, Q12); `plan/SPIKE2-package-routing.md` 1.0 (running; M2, M4, M5 feed this plan); the `gabay-product-rulings` skill.
> **Before any coder starts:** P0-04 r2 and P0-06 r2 exist and this plan is re-issued as 1.0 citing them (CLAUDE.md: "The spec moved past the revision the plan cites: stop and ask"). If r2 changes more than §4 lists, the plan comes back to you.

## 1. What FF-4 delivers

On an Android emulator, or your phone connected to this machine, against the local API (E-20, localhost only):

1. **The mall picker:** the published malls from the local API, with search; the mall you are in at the top when location allows it.
2. **Package delivery:** download, SHA-256 check, opened read-only; the ETag refresh check on launch, on pick and every 5 minutes; a newer map swapped in only between trips, with "Map updated".
3. **The Map tab**, replacing FF-SK's placeholder: the 2.5D map with levels, pinch, rotate with the compass, the flat toggle, the whole-site and all-levels views, wing shortcuts and labels that thin out.
4. **Routes:** tap a store, Go, and see the shortest route and, when one qualifies, the other way (dotted amber), with metres and minutes and a leg list. The start is set by a long press, in internal builds only (§3.1).
5. **The engine underneath:** A* in a long-lived worker isolate over the package's graph, the One Router test vectors, the stairs rule, store shortcuts and passages.

**P0-04 and P0-06 stay `IN PROGRESS` after FF-4.** Neither entry is finished by this slice:
- **P0-04 r3 and later** (P0-04 Q6 (a)): the turning map (with P0-08 or P0-15), the "For everyone" settings (with P0-14), favourites and the last 8 destinations (with P0-05), the set-location button (P0-08), follow-my-level (P0-13). P0-04 is `DONE` when the last lands.
- **P0-06 r3** (P0-06 Q2, option 1): Find another way, off route and the wrong-way notice, browsing, arrival, landmark-first directions with the landmark label, Avoid stairs and Avoid escalators. Built in FF-6 with P0-08's hand-set position; the live-dot parts proven again in FF-9.

**Not in FF-4:** everything in P0-04 §10 and P0-06 §10. The "Shortcuts through stores" and "Prefer stairs" switches do not ship: Me stays FF-SK's placeholder plus "Change mall" (P0-04 Q6 (a), P0-06 Q9 option 1). The engine options are proven by tests, and the switches come with the Me tab (P0-14, FF-7).

## 2. Depends on the specs' questions (assumed: recommended)

This draft assumes each spec's recommended option for every question. If you rule another option, the right-hand column says what changes.

**P0-04 r1, §11:**

| Q | Assumed (recommended) | What changes otherwise |
|---|---|---|
| Q1 packages | `crypto` and `path_provider`, each pinned from a pub.dev check with an EXCEPTIONS entry (E-21, E-22); location through Gabay's own platform channel `gabay/location` | (b) a Kotlin SHA-256 and folder channel: no EXCEPTIONS, more native work. (c) adds `geolocator` and a third entry, and no Kotlin |
| Q2 settings to the phone | The mall list carries each mall's resolved shopper settings from an allow-list; Blueprint defaults until received; a non-positive or non-numeric value is ignored | (b) settings in the package: api-coder drops the list field, and FF-3's writer adds them. (c) a third public route and its tests |
| Q3 launch and switching | Launch opens the picker, with the detected mall at the top marked "You're here", else the last mall; location asked the first time the picker opens; changing malls during a route asks "End your route to ⟨place⟩?"; preselect only when the fix, accuracy included, is inside exactly one boundary | (b) or (c): the launch route goes to the map, and a switch card or direct open replaces the top-of-list marker |
| Q4 detection on localhost | P0-02's seed gives Aurora an invented georeference (throwaway) at a point you name (Questions, 3) | (b) no seed change; detection is only unit-tested. (c) the penthouse's real georeference in the internal source only |
| Q5 the route start | See §3.1 | — |
| Q6 r1's scope | The intent plus the container; the other tabs stay FF-SK placeholders (r2); Me gets "Change mall" | (b) every Me setting now: flutter-coder adds the settings screen, and P0-04 could reach `DONE` sooner. (c) Places, Parking and Me hidden: contradicts FF-SK's ruled shell, so it needs a ruling on FF-SK too |
| Q7 Tagalog | English now; G2's Tagalog waived to P0-14 by an L-row (§14) | (b) `app_tl.arb` now, for your review at sign-off |
| Q8 wing shortcuts | One per building, by its name, in published order, main building first | (b) a migration for `Building.ShortName` (item 1 applies). (c) AC-36 moves to a later revision |
| Q9 delivery details | i kept and marked "No longer updated"; ii not swapped, "Update Gabay to get this mall's latest map"; iii each mall's current package kept, the old file deleted after a swap, no cap; iv check at once on return; v an inactive tenant's or venue's versions are neither listed nor served; vi keep the camera and level where they still exist, close a sheet whose place is gone; vii no stale notice | Each other option changes one test in §7 (EC-8, EC-9, EC-28, EC-29, EC-2) and one rule in `package/delivery/` |
| Q10 speed targets | No number in r1 or r2; numbers become provisional targets later | See Questions, 4: Spike 2 does not measure map drawing, so FF-4 must |
| Q11 the sheet split | See §3.2 | — |
| Q12 picker cards | Name, building and level counts, and the boundary's outline; the full thumbnail once the mall is held | (b) text only: less work. (c) a thumbnail made at publish: an FF-3 change |
| Q13 recentre | Hidden until there is a position, then it returns the camera there | (b) or (c): recentre always shown, to a default framing |

**P0-06 r1, Questions:**

| Q | Assumed (recommended) | What changes otherwise |
|---|---|---|
| Q1 the route start | See §3.1 | — |
| Q2 the rest of P0-06 | P0-06 r3 in FF-6; IN PROGRESS after FF-4; r1 shows a leg list (DC-8) | 2: a static directions list joins FF-4 (engine-coder: turn detection, 30°/50° rules; more tests). 3: every part at engine level now, on simulated position streams: roughly doubles engine-coder's share |
| Q3 latency target | FF-S2 reports; P0-06 r2 adds the measured target; this plan cites r2 | 2: P0-06 waits for FF-S2, and only the P0-04 half proceeds |
| Q4 the A* estimate | A planar term and a per-level term with coefficients derived from the package's own edges at load (§6.2) | 2: the literal RG2 formula, and FF-3 refuses packages where it overestimates. 3: Dijkstra only; `heuristic.dart` goes, the vectors stay |
| Q5 one planar frame | One frame per venue for every building and level | 2: the planar term is 0 across buildings (still correct, slower) |
| Q6 `routing.*` to the phone | Copied into the package at publish (also P0-03 Q12 (a)) | See §3.3: this differs from P0-04 Q2 |
| Q7 a closed passage | The places behind it are unreachable, with the reason "⟨store⟩ is closed and it is the only way in" | 2: the passage is used whatever its status |
| Q8 the lead's label | "Recommended (N m)" when the stairs rule demoted a shorter stairs way; "Shortest" otherwise | 2: always "Shortest" |
| Q9 the split | See §3.2 | — |

**Also assumed, from FF-3's spec** (P0-03 r1): Q1 (a) (the package format is fixed after FF-S2 reports), Q3 (a) (a local folder behind one storage interface), Q12 (a) (the allow-list, with the routing settings in the package), Q14 (a) (a development command publishes the seeded venues). If FF-3's plan differs, the package reader (§6.2) and the API's file read (§6.1) follow it.

## 3. Reconciling the two specs

### 3.1 Where a route starts (P0-04 Q5 = P0-06 Q1)

- **P0-04 Q5 (a):** "an internal-build-only 'Start here' (a long press on the map), drawn as a hand-set dot with the dashed ring, removed when P0-08 ships."
- **P0-06 Q1, option 1:** "A 'Start here' tool in internal builds only: a long-press on the map sets the origin, snapped by RG3; stripped from release builds like the role picker and Test tools (L85, P0-04). DESIGN CHOICE; P0-08 replaces it in FF-6."

**Chosen: both, combined.** They agree on the tool; each adds one detail and both details are kept:
- a long press on the shown level sets the origin (x, y, level);
- it is drawn as a hand-set dot with the dashed ring (P0-04; L106 keeps the dashed ring for hand-set positions);
- the worker snaps it by RG3 (P0-06 AC-8);
- it exists only when the build-time flag `GABAY_INTERNAL_TOOLS` is true (§11 DC-8), listed in invariant 16's registry;
- P0-08 (FF-6) removes it.

**A gap neither spec settles:** what Go does in a build without the tool (Questions, 1).

### 3.2 Who owns the route sheet (P0-04 Q11 = P0-06 Q9)

- **P0-04 Q11 (a):** "P0-04 owns the sheet, its three states, ✕ and the trip-active state; P0-06 owns what goes in it (summary, steps, the other way's label) and arrival."
- **P0-06 Q9, option 1:** "P0-06 owns the route ViewModel and the route section of the sheet (the way pills, the no-other-way line, the leg list); P0-04 owns the sheet container, the place sheet with Go, the map drawing and the level chips."

**Chosen: the two agree, with one difference on arrival.**

| Part | Owner (spec) | Built by |
|---|---|---|
| The sheet container, its three states (one line, summary, steps), ✕, the trip-active state | P0-04 | flutter-coder |
| The place sheet with Go | P0-04 | flutter-coder |
| The map's route drawing and the level chips' route marks | P0-04 | flutter-coder |
| The route ViewModel; the route section: way pills, "There is no other way to get there.", the leg list, the other way's label | P0-06 | flutter-coder (ViewModel and widgets), on engine-coder's result (AC-27) |
| The route search, the result, the labels' rule | P0-06 | engine-coder |
| Arrival | P0-06 (P0-04 Q11 (a)) | **Not in FF-4:** P0-06 r1 puts arrival out of scope (Q2). In FF-4 a trip ends only with ✕ |

### 3.3 One more overlap: how settings reach the phone

The two specs recommend different routes for `routing.*`:
- **P0-04 Q2 (a)** covers "`package.refreshCheckS` now; later `map.*`, `routing.*`, `voice.*`" and recommends "the public mall list carries each mall's resolved shopper settings".
- **P0-06 Q6, option 1:** "Publish copies the venue tenant's values … of an allow-listed set of `routing.*` keys into the package: offline, frozen with the version." P0-03 Q12 (a) agrees.

**This draft assumes a split by key:** `routing.*` travels only in the package, and everything else the phone needs (`package.refreshCheckS` now) travels only in the list. A route is then always computed with the settings frozen in its own version, and works offline from the first open. Because the documents disagree, this is put to you (Questions, 2).

### 3.4 Speed numbers

- **P0-04 Q10 (a):** "FF-S2 measures map drawing and package loading on the low-end phone".
- **`plan/SPIKE2-package-routing.md` §2:** "Not measured … rendering with `flutter_map` … Rendering is measured in P0-04 itself, against the real renderer."

They disagree on map drawing (Questions, 4). This draft assumes package loading comes from FF-S2 (M2, M4), and map drawing is measured in FF-4 on the realme and reported as provisional, with no pass or fail.

## 4. What the two specs' r2 must change (spec-writer, before plan 1.0)

**P0-04 r2:**
1. The shell exists (FF-SK, P0-16). §1 item 5, §2 "Shell" and §3 H are rewritten as "the Map tab replaces FF-SK's Map placeholder". AC-48 becomes: four tabs, Map built, and Places, Parking and Me still FF-SK's placeholder pages. Q6 (a)'s "Coming in a later build" note is replaced by FF-SK's placeholder (name, pipeline ID, slice).
2. FF-SK's module registry: the Map entry flips to built and supplies its route (FF-SK §2).
3. Me: FF-SK's placeholder keeps its place, with "Change mall" added above it (Q6 (a)).
4. AC-49, AC-50 and AC-53 are limited to what FF-4 adds: no emergency button on the map rail; the Start-here tool behind its flag; ×1.4 on the picker, map rail and sheets. FF-SK already tests the shell's own parts.
5. AC-51: r2 says whether the portrait lock and landscape on tablets belong to FF-SK's shell or to FF-4. FF-SK §6 does not mention them. This draft assumes FF-4.
6. The reconciled answers of §3.1 and §3.2 replace Q5 and Q11; §6's "to reconcile" paragraph is removed; arrival is marked "not in FF-4".
7. Each question's ruling folds into its AC. The "until ruled" edge cases EC-8, EC-9, EC-14, EC-27, EC-28 and EC-29 get their expected results.
8. Dependencies gain P0-16 (FF-SK) and the FF-S2 report (package size, M1; open time, M2).
9. If you rule Questions 4 as recommended: Q10's wording ("FF-S2 measures map drawing") is corrected to "FF-4 measures map drawing on the realme".

**P0-06 r2:**
1. §5 and AC-34: the provisional latency target from FF-S2's M5 p95, with PRD §6.6 and §7 and Blueprint OQ6 (L117 ruling 4). AC-34 becomes pass or fail against it.
2. Each question's ruling folds in: Q1 (§3.1), Q4 (the RG2 wording, with an L-row amending L79), Q5, Q6, Q7 (EC-24's expected result), Q8 (AC-15's label), Q9 (§3.2). EC-27 and EC-32 get their expected results.
3. AC-19 and AC-26 say the switches ship with P0-14's Me settings, and are proven at the engine and ViewModel level in FF-4.
4. The later revision for Q2's parts is named r3, so r2 is free for the latency target.

## 5. Before FF-4 starts

| Needs | Why |
|---|---|
| FF-SK merged | The shopper shell, the module registry and the placeholder tabs |
| FF-0 merged | The `routes/api.js` groups; FF-SK builds on it too |
| FF-2 merged | The seeded malls (Aurora above all) |
| FF-S2 reported | P0-06 r2's latency target; P0-03's package format |
| FF-3 merged | The package writer, the storage interface (P0-03 AC-51), published seed versions, `PackageFormatVersion` |
| P0-04 r2, P0-06 r2, this plan 1.0 | §4 |

**What can start early, once 1.0 is approved:**
- engine-coder: the vectors, the reference Dijkstra, A* and the heuristic on an in-memory graph, before FF-3 merges (§6.2). The file reader waits for FF-3.
- flutter-coder: the map projection and the picker against the response shape fixed in §6.1, before api-coder's PR merges.

## 6. The work split

### 6.1 api-coder: the public routes, the settings, the seed

**Routes** (`functions/src/routes/public/`): `index.js` (the GET-only group), `venues.js`, `packages.js`, and `functions/src/services/publicVenue.service.js`. They are mounted in `routes/api.js` before `auth`, as Blueprint Part 1's order says ("unauthenticated mounts first: /api/public/*"), and outside FF-0's "admin features (E-20)" group, so the stub is never on them.

- **`GET /api/public/venues?search=&page=&pageSize=`** (P0-04 AC-1–AC-3):
  - venues with at least one PUBLISHED version, from every tenant, with the venue and its tenant active (Q9 v);
  - paged by `runPaged`;
  - every search word must match the name, case-insensitive, parameterized `ILIKE`;
  - each item has exactly these keys: `id`, `code`, `name`, `versionNo`, `packageSha256`, `packageSizeBytes`, `publishedAt`, `buildingCount`, `levelCount`, `boundary`, `georeference` (null when unset) and `settings` (`{ "package.refreshCheckS": <resolved> }`). There is no `tenantId`.
- **`GET /api/public/venues/:venueId/package`** (AC-4–AC-6, AC-9):
  - the latest PUBLISHED version's bytes, read through P0-03's storage interface;
  - `ETag: "<PackageSha256>"`, `Gabay-Package-Version: <versionNo>`, `Content-Type: application/octet-stream`, `Cache-Control: no-cache`;
  - a matching `If-None-Match` gets 304 with no body;
  - an unknown, unpublished, inactive or malformed id gets 404 or 400 in the standard error shape.
- **Any other method on `/api/public/*`** gets 405 and changes nothing (AC-7).
- **The cross-tenant queries** carry `// tenant-scope: public read of PUBLISHED versions (Public-Read rule)` (AC-10).
- **No validation package yet:** the id and paging are parsed by hand to 400s. zod is R5's (§13).

**Settings** (`functions/src/config/settings.js`):
- `package.refreshCheckS` (default 300) joins `DEFAULTS`;
- a new frozen `SHOPPER_SETTINGS` allow-list sits beside `PUBLIC_FLAGS`, resolved per venue tenant (override, else platform);
- the platform `GlobalSetting` rows `package.refreshCheckS` = 300 and `routing.stairsSaveM` = 144 are seeded (P0-06 AC-18), unless FF-3 already seeded the second.

**Seed:** Aurora gets an invented `GeoreferenceJson` at the point you name (P0-04 Q4 (a); throwaway, E-20) in `db/seeds/lib/demo.js`.

### 6.2 engine-coder: the router, the vectors, the package reader

**Package reader** (`app/lib/core/package/reader/`; DC-3):
- `package_reader.dart` is an interface; `sqlite_package_reader.dart` opens `file:<path>?mode=ro&immutable=1` through `sqlite3` 3.x (E-02).
- It checks the metadata table's format version (a newer one gives a typed "app too old" error: P0-04 Q9 ii).
- It decodes the CSR blob into typed arrays and runs the structural check (P0-06 DC-4: no negative or non-finite cost, no broken offsets).
- It reads levels, buildings with `MapUpDeg`, places and their door nodes, store `PassThrough` and `IsRoutable`, passages, connector names, the routing settings and the per-level geometry the map draws.
- It queries the R*Tree for RG3.
- Its layout follows FF-3's writer exactly; nothing is guessed before FF-3 merges.

**Router** (`app/lib/core/routing/`):
- `routing_worker.dart`: one long-lived isolate (`Isolate.spawn`, kept by `SendPort`/`ReceivePort`; RECALLED, checked in the docs before coding). It opens its own read-only connection and loads the graph once per package version (AC-2). It reloads only on the swap signal and only when no route is active (AC-33).
- `router_service.dart`: the stateless UI-side service. It sends queries, a newer query supersedes a pending one (DC-6), it restarts a dead worker (EC-15), and it drops a result whose version differs from the open map's, then runs the query again (AC-33).
- `astar.dart`: a binary-heap A* to the set of the place's door nodes (DC-1), the tie-break by lower node index (DC-2), costs compared within 0.001 m (DC-3).
- `heuristic.dart`: P0-06 Q4, option 1. At load, `a = min(1, min over edges of cost ÷ planar length)` and `b = max(0, min over level-changing edges of (cost − a × planar run) ÷ levels changed)`. The estimate is `a × planar distance + b × levels apart`, the minimum over the target doors.
  - It never exceeds any edge's cost, so it never overestimates a route, whatever a mall tunes. A zero-cost connector makes it 0, which is Dijkstra: slower, still correct.
  - This needs one planar frame per venue (P0-06 Q5).
- `snap.dart`: RG3. Candidate walk edges come from the R*Tree in a growing window. An edge counts only if the segment from the origin to its projection crosses no wall segment. The route starts at the projection, and a one-way edge is joined only in its direction (AC-8, AC-9).
- `stairs_rule.dart`, `other_way.dart` (the middle edge, DC-5; L87's 0.5 m and 2× filter; L110's labels), and `route_result.dart` (AC-27's shape, the legs of DC-8, and the metres and minutes formatter, AC-10).
- Leg kinds and result kinds go in the app's one constants file, each with its authority comment (item 14). If FF-3 has not created that file, it is `app/lib/core/config/gabay_constants.dart`.

**The One Router vectors:** `app/test/fixtures/routing/vectors.json` (DC-6). Each vector holds a graph, a query, options, the expected metre cost and, where unique, the path. Every vector is solved twice, by A* and by the test's own plain Dijkstra.

**Fixture packages:** built by FF-3's own writer from small hand-written venue models (DC-7), for the reader's tests and the end-to-end Dart tests.

### 6.3 flutter-coder: the Map tab on FF-SK's shell

- **Delivery** (`app/lib/core/package/delivery/`):
  - `package_store.dart`: a folder from `path_provider`; staging files; one held file per mall; the old file deleted after a swap (Q9 iii).
  - `package_downloader.dart`: a streamed download through the one `ApiClient`, which gains a `download` method.
  - `package_verifier.dart`: SHA-256 with `crypto`, checked against the response's own ETag and version (P0-04 EC-4).
  - `response_guard.dart`: anything without the API's headers, or with an HTML body, a redirect, 511 or an unexpected status, counts as offline (AC-21).
  - `refresh_scheduler.dart`: elapsed time (`Stopwatch`), app lifecycle, the triggers, and the setting read from the list.
  - `swap_coordinator.dart`: holds the swap while a trip is active, shows "Map updated" once, and sends the reopen signal to `router_service`.
- **Picker** (`app/lib/features/shopper/venues/{models,services,viewmodels,views}`):
  - the launch route, above the shell (DC-9), built from `ModuleListScaffold`, `PagedListNotifier` and `DebouncedSearchField`;
  - cards per Q12 (a);
  - `venue_detector.dart`: the fix through the georeference, preselected only when the accuracy circle lies inside exactly one boundary;
  - `location_source.dart`: the interface over `gabay/location`, with a fake for tests.
- **Map** (`app/lib/core/map3d/`):
  - `projection.dart`: the forward projection and its exact inverse (the tilted-tap trap);
  - `scene_builder.dart`: slabs, walls with door gaps, column and furniture blocks, read in `Isolate.run` with its own read-only connection (DC-4);
  - `map_painter.dart`: layers in order: scene, route, pins, dot;
  - `label_thinning.dart`: thresholds scaled to the venue's extent;
  - `camera.dart`: pinch, twist, the compass reset to `Building.MapUpDeg`, else `Venue.MapUpDeg`; one step when animations are off;
  - `hit_test.dart`: pins with a target of at least 48 dp.
- **The Map tab** (`app/lib/features/shopper/map/`):
  - level chips, the whole-site and all-levels views, wing shortcuts (Q8 (a)), and the rail (flat toggle, compass, recentre per Q13 (a));
  - the place sheet with Go; the sheet container with its three states and ✕; the trip-active state;
  - the Start-here tool behind `GABAY_INTERNAL_TOOLS`;
  - the tablet layout and orientation (§4, P0-04 item 5);
  - saved state through `shared_preferences` (the last venue, the camera per venue), with a broken value falling back to the default.
- **Route section** (`app/lib/features/shopper/route/`, P0-06's part): the route ViewModel (four states, AC-31; re-runs when an option changes, AC-26), the way pills, the no-other-way line and the leg list.
- **Me:** a "Change mall" row above FF-SK's Me placeholder.
- **Android:** location permissions for while-in-use only (no background); plain `http` allowed only in the debug manifest, if Android requires it (RECALLED, checked).

### 6.4 The location channel (native-ble, if you agree: Questions, 5)

`gabay/location` in Kotlin: a one-shot current fix with its accuracy, while-in-use only, through Android's own location service (no Google Play services package; the exact API is RECALLED and checked in the docs). The Swift side waits for P1-05.

## 7. Tests first, and the traceability table

**Order:** each coder writes the failing tests for their part before the code. test-verifier then fills the "Result" column with `npm run verify` output and adds any missing test.

**Where the tests live:**
- Dart unit and widget tests run in `flutter test` inside `npm run verify`.
- The API tests run in `api:test`, on real seeded rows inside a rolled-back transaction (L151).
- **By hand on the emulator** (`app/integration_test/`, with output pasted, because verify has no device): P0-06 AC-28 and AC-34's timings, P0-04 EC-18. This needs the SDK's `integration_test` package (Questions, 6).

Paths below: `api:` = `functions/test/`, `app:` = `app/test/`.

### 7.1 P0-04 r1

| ID | Test (file: case) | By |
|---|---|---|
| AC-1 | api:`public.venues.test.js`: only venues with a PUBLISHED version, both tenants; BUILDING-only, FAILED-only and none left out; envelope and cap | api |
| AC-2 | api:`public.venues.test.js`: every word, case-insensitive; "spire", "bay grand"; no split on "s" | api |
| AC-3 | api:`public.venues.test.js`: exact key set, no `tenantId` | api |
| AC-4 | api:`public.package.test.js`: bytes, `ETag`, `Gabay-Package-Version` | api |
| AC-5 | api:`public.package.test.js`: current `If-None-Match` gives 304 with an empty body | api |
| AC-6 | api:`public.package.test.js`: after a newer publish, 200, a new ETag, and SHA-256 of the bytes = `PackageSha256` | api |
| AC-7 | api:`public.mount.test.js`: POST, PUT, PATCH and DELETE get 405; row counts unchanged | api |
| AC-8 | api:`public.mount.test.js`: anonymous = each role's token = the shopper's = any `X-Tenant-Id`; the stub is not in the chain | api |
| AC-9 | api:`public.package.test.js`: unknown, unpublished and malformed ids give 4xx in the standard shape | api |
| AC-10 | The `tenant-predicate` and `sql-interpolation` linters in verify | api |
| AC-11 | app:`shopper/venues/venue_picker_test.dart`: loading, empty, error with Retry, data with Load more | flutter |
| AC-12 | app:`venue_picker_test.dart`: the shared search field sends `search`; `no-bare-textfield` lint | flutter |
| AC-13 | app:`venue_picker_test.dart`: not held, so downloading then map; held, so map at once plus one check | flutter |
| AC-14 | app:`venue_detector_test.dart` (through the georeference, accuracy inside one boundary); `venue_picker_test.dart` ("You're here" at the top, fake location) | flutter |
| AC-15 | app:`venue_picker_requests_test.dart`: no request carries a coordinate (fake `ApiClient` records every call); `position-privacy` lint; review privacy pass | flutter |
| AC-16 | app:`venue_picker_test.dart`: denied, unavailable, no fix and outside each give a plain manual picker | flutter |
| AC-17 | app:`venue_detector_test.dart`: no georeference means never detected | flutter |
| AC-18 | The `foreground-manifest` lint; the channel asks while-in-use only (review) | flutter, native-ble |
| AC-19 | app:`package/delivery/package_download_test.dart`: one tampered byte means deleted, held one kept | flutter |
| AC-20 | app:`package_download_test.dart`: a dropped stream never becomes held; the next trigger restarts | flutter |
| AC-21 | app:`response_guard_test.dart`: 200 HTML, 302, 511 and missing headers are offline, no dialog | flutter |
| AC-22 | app:`package/package_reader_test.dart`: opened `mode=ro&immutable=1`; a write throws (sqlite3 on the test host) | engine |
| AC-23 | app:`refresh_scheduler_test.dart`: one conditional request on launch, on pick and every N s (fake clock and adapter); 304 changes nothing | flutter |
| AC-24 | app:`package_swap_test.dart`: downloads during use; swaps only with no active route | flutter |
| AC-25 | app:`trip_swap_test.dart`: mid-route, kept; ✕ swaps, then "Map updated" | flutter |
| AC-26 | app:`package_swap_test.dart`: "Map updated" exactly once; the reopen signal reaches a fake router service | flutter |
| AC-27 | app:`refresh_scheduler_test.dart`: offline or a failed check keeps the held one, no dialog, retries next trigger | flutter |
| AC-28 | app:`refresh_scheduler_test.dart`: the lifecycle fake goes to the background, so the timer stops and no request is made | flutter |
| AC-29 | app:`offline_map_test.dart`: held mall opens, levels, views, place sheet and Go work; the picker lists held malls; manual smoke row | flutter |
| AC-30 | app:`venue_picker_test.dart`: offline with nothing held shows the one-time-connection message with Retry | flutter |
| AC-31 | app:`map3d/scene_builder_test.dart` (fixture package); `map_tab_test.dart`; screenshots | flutter |
| AC-32 | app:`map_tab_test.dart` (pinch, twist, no zoom buttons, compass shown when rotated); `camera_test.dart` (the angle chosen) | flutter |
| AC-33 | app:`camera_test.dart`: needle only with a georeference | flutter |
| AC-34 | app:`level_chips_test.dart`: order, shown, scroll into view, route marks and their screen-reader text | flutter |
| AC-35 | app:`site_views_test.dart`: whole site opens a building; all levels opens a level | flutter |
| AC-36 | app:`wing_shortcuts_test.dart`: one per building, main first (Q8 (a)) | flutter |
| AC-37 | app:`label_thinning_test.dart`: a small and a mall-sized fixture | flutter |
| AC-38 | app:`projection_test.dart`: round trips within 0.001 m at tilt 0–60°, rotation 0–359°, zoom 0.5–8× (DC-10); `map_tab_test.dart`: a tap at a pin's 48 dp edge | flutter |
| AC-39 | app:`paint_order_test.dart`: scene, then route, then pins, then dot | flutter |
| AC-40 | app:`map_tab_test.dart`: recentre hidden with no position; after Start here, it returns there | flutter |
| AC-41 | The `colour-literals` lint; screenshots light and dark | flutter |
| AC-42 | app:`camera_test.dart`: `disableAnimations` and the iOS reduce-motion flag (injected) give a one-step move | flutter |
| AC-43 | app:`map_semantics_test.dart`: the map's description (mall, level, view); every rail control named | flutter |
| AC-44 | app:`place_sheet_test.dart`: name, level, status; not routable means dimmed pin, Go disabled with the reason | flutter |
| AC-45 | app:`trip_test.dart` (fake router): Go marks the trip active, draws both ways and marks the chips | flutter |
| AC-46 | app:`trip_test.dart`: only ✕ ends it; a swipe does not. Arrival is not in FF-4 (§3.2) | flutter |
| AC-47 | app:`trip_test.dart`: a restart does not restore the route | flutter |
| AC-48 | app:`shopper_shell_ff4_test.dart`: four tabs; Map built; Places, Parking and Me show FF-SK placeholders (r2) | flutter |
| AC-49 | app:`shopper_shell_ff4_test.dart`: no emergency button on the map or rail | flutter |
| AC-50 | app:`internal_tools_test.dart`: flag off means no Start here and no long-press handler; review: the flag is in invariant 16's registry | flutter |
| AC-51 | app:`layout_test.dart`: 360×800 portrait; 800×1280 and 1280×800 wide, keeping the camera and level; screenshots | flutter |
| AC-52 | app:`saved_state_test.dart`: restored after restart; corrupt, out-of-range and foreign values fall back | flutter |
| AC-53 | app:`overflow_test.dart`: ×1.4 at 320 dp on the picker, rail and sheets | flutter |
| AC-54 | Review: `minSdk = 24` is already at `app/android/app/build.gradle.kts` line 22; FF-4 does not touch it | review |
| EC-1 | app:`venue_picker_test.dart` (= AC-30) | flutter |
| EC-2 | app:`offline_map_test.dart`: a weeks-old held mall is used offline, no notice (Q9 vii) | flutter |
| EC-3 | app:`response_guard_test.dart` (= AC-21) | flutter |
| EC-4 | api:`public.package.test.js`: publish between list and download; app:`package_download_test.dart`: checked against its own ETag, no retry loop | api, flutter |
| EC-5 | app:`refresh_scheduler_test.dart`: two publishes, only the latest downloaded | flutter |
| EC-6 | api:`public.venues.test.js`, `public.package.test.js`: BUILDING and FAILED are never listed or served | api |
| EC-7 | app:`trip_swap_test.dart` (= AC-25) | flutter |
| EC-8 | app:`package_swap_test.dart`: gone from the list or 404 means kept and marked "No longer updated" (Q9 i) | flutter |
| EC-9 | app:`package_reader_test.dart` (newer format gives a typed error); `package_swap_test.dart` (not swapped, the card's line; nothing held means it cannot open, with the reason) | engine, flutter |
| EC-10 | app:`package_download_test.dart`: a failing file write means no swap; nothing held means the picker's error with Retry | flutter |
| EC-11 | app:`package_store_test.dart`: a missing or unopenable file counts as not held | flutter |
| EC-12 | app:`package_download_test.dart` (= AC-20) | flutter |
| EC-13 | app:`venue_picker_test.dart`: A then B; B shown; A may be held but never shown | flutter |
| EC-14 | app:`trip_test.dart`: changing mall mid-route asks "End your route to ⟨place⟩?" (Q3 (a)) | flutter |
| EC-15 | app:`venue_picker_test.dart`: the empty state | flutter |
| EC-16 | app:`site_views_test.dart`: one building, one level | flutter |
| EC-17 | app:`site_views_test.dart`, `camera_test.dart`: outdoor ground; `Venue.MapUpDeg` | flutter |
| EC-18 | app:`level_chips_test.dart` (an 8-level fixture scrolls); by hand on the emulator with Aurora (§8) | flutter |
| EC-19 | app:`overflow_test.dart`: long names wrap or ellipsize; full name in the label | flutter |
| EC-20 | api:`public.venues.test.js`: both tenants listed, allow-list only, the header changes nothing | api |
| EC-21 | api:`public.mount.test.js` (= AC-8) | api |
| EC-22 | app:`venue_picker_test.dart`: denied, "only this time" and approximate allow a manual pick; a coarse fix spanning two malls preselects none | flutter |
| EC-23 | app:`venue_detector_test.dart`: two overlapping boundaries mean no preselection | flutter |
| EC-24 | api:`public.package.test.js`: a draft edit after publish leaves the ETag and bytes unchanged | api |
| EC-25 | api:`public.package.test.js`, `public.venues.test.js`: a non-numeric or negative id gets 400; a garbage `If-None-Match` gets 200; a page past the end is empty | api |
| EC-26 | app:`refresh_scheduler_test.dart`: a wall-clock jump neither floods nor stops checks | flutter |
| EC-27 | app:`refresh_scheduler_test.dart`: 0, negative and non-numeric values use 300 (Q2 (a)) | flutter |
| EC-28 | app:`refresh_scheduler_test.dart`: back after more than one interval means an immediate check (Q9 iv) | flutter |
| EC-29 | app:`package_swap_test.dart`: the level kept if it exists, else the default view; a sheet whose place is gone closes (Q9 vi) | flutter |
| EC-30 | app:`layout_test.dart`: a phone sets the portrait-only preference | flutter |
| EC-31 | app:`map_tab_test.dart`: theme switch redraws from the dark tokens | flutter |
| EC-32 | app:`saved_state_test.dart` (= AC-52) | flutter |

### 7.2 P0-06 r1

| ID | Test (file: case) | By |
|---|---|---|
| AC-1 | app:`routing/vectors_test.dart`: every vector's A* cost = the reference Dijkstra's ±0.001 m | engine |
| AC-2 | app:`routing/routing_worker_test.dart`: one graph load across several queries; the search code reached only in the worker | engine |
| AC-3 | Vector "two doors, far one cheaper" | engine |
| AC-4 | Vectors "against the escalator: longer legal way" and "no legal way" | engine |
| AC-5 | Vector "lift, four stops, each pair at its cost" | engine |
| AC-6 | Vector "two buildings over the outdoor ground", legs marked outdoor | engine |
| AC-7 | Vectors: tuned-low connector, zero cost, escalator with a run (the Q4 example), multi-level lift, store crossing; app:`routing/heuristic_test.dart`: the estimate ≤ every edge on every vector | engine |
| AC-8 | app:`routing/snap_test.dart`: 1 m away through a wall is skipped for 4 m in the open | engine |
| AC-9 | app:`snap_test.dart`: the start at the projection; a one-way edge joined only its way | engine |
| AC-10 | app:`routing/route_format_test.dart`: whole metres, ≥ 1 m; Simple "< 1 min" and rounded up; Technical one decimal | engine |
| AC-11 | app:`vectors_test.dart`: 100 repeats identical; tie vectors | engine |
| AC-12 | app:`routing/other_way_test.dart`: connectors banned; middle edge banned when none | engine |
| AC-13 | app:`other_way_test.dart`: exactly lead + 0.5 m and exactly 2× are not offered; app:`route/route_section_test.dart`: the "no other way" line | engine, flutter |
| AC-14 | app:`other_way_test.dart`: "via ⟨connector⟩", "goes outside", "Other way 1"; `route_section_test.dart` | engine, flutter |
| AC-15 | app:`route_section_test.dart`: two pills; tapping one swaps the active way and the dotted line; app:`trip_test.dart` draws the dotted amber line | flutter |
| AC-16 | app:`routing/stairs_rule_test.dart`: the no-stairs way leads; the stairs way is the other way, not filtered | engine |
| AC-17 | app:`stairs_rule_test.dart`: exactly + 144 means stairs lead; no no-stairs way means stairs lead | engine |
| AC-18 | app:`stairs_rule_test.dart`: 144 and an override, each read from a fixture package; api:`settings.shopper.test.js`: the platform row `routing.stairsSaveM` = 144 is seeded | engine, api |
| AC-19 | app:`stairs_rule_test.dart`: the prefer-stairs option means least cost leads | engine |
| AC-20 | app:`stairs_rule_test.dart`: no stairs on the least-cost way means the rule is not applied | engine |
| AC-21 | Vectors: shortcuts off means no crossing, except a passage for its places | engine |
| AC-22 | Vector: shortcuts on and routable means crossing at weight 1.25 | engine |
| AC-23 | Vectors: the same store Open, then Closed | engine |
| AC-24 | Vectors: a passage used for its places whatever the setting, not otherwise while off | engine |
| AC-25 | app:`routing/route_result_test.dart`: the crossing leg's real metres; `route_section_test.dart`: "Walk through ⟨store⟩ (N m)" with the icon | engine, flutter |
| AC-26 | app:`route/route_viewmodel_test.dart`: an option change re-runs from the same origin | flutter |
| AC-27 | app:`route_result_test.dart`: the full shape on vectors, including the version | engine |
| AC-28 | By hand: `app/integration_test/route_on_aurora_test.dart` on the emulator, output pasted; smoke row; screenshots (fixture package) light, dark, phone, tablet | flutter |
| AC-29 | app:`route_viewmodel_test.dart`: refuses a non-routable destination; `place_sheet_test.dart`: no Go, with the reason | flutter |
| AC-30 | app:`routing/routing_offline_test.dart`: a failing HTTP client is never called; airplane mode by hand | engine |
| AC-31 | app:`route_section_test.dart`: computing; no route with each of three reasons; unavailable; ways shown | flutter |
| AC-32 | app:`vectors_test.dart` runs the JSON file; a self-test proves that a wrong expected cost fails the runner | engine |
| AC-33 | app:`routing_worker_test.dart`: no reload while a route is active; a mismatched-version result is dropped and re-run | engine |
| AC-34 | app:`routing/scale_test.dart` (in verify): a generated 20,000-node graph, 200 random pairs all equal to Dijkstra. Timing by hand: `integration_test/routing_timing_test.dart` on the emulator and the realme, pasted; pass or fail only against r2's target | engine |
| EC-1 | app:`routing_offline_test.dart` (= AC-30); by hand | engine |
| EC-2 | app:`routing_worker_test.dart`: v3 kept until the swap; versions never mix | engine |
| EC-3 | app:`package_reader_test.dart`: unknown format, broken CSR, negative cost and NaN fixtures give "routing unavailable"; the app keeps running | engine |
| EC-4 | Vector: one level, no connectors; the other way by the middle edge | engine |
| EC-5 | app:`place_sheet_test.dart`: no routable store means Go nowhere | flutter |
| EC-6 | app:`snap_test.dart`: a level with no edges means "Can't start from here" | engine |
| EC-7 | app:`scale_test.dart` (= AC-34) | engine |
| EC-8 | Vector "origin at the destination's door" gives "already here"; `route_section_test.dart` shows no line, with the ARB text | engine, flutter |
| EC-9 | app:`snap_test.dart`: inside a store, interior edges first, else through its door | engine |
| EC-10 | app:`snap_test.dart`: walled in means "Can't start from here" | engine |
| EC-11 | app:`snap_test.dart`: outside the boundary means "Can't start from here" | engine |
| EC-12 | Vector: unreachable gives the reason "unreachable from here" | engine |
| EC-13 | app:`routing_worker_test.dart`: another venue's place id is refused | engine |
| EC-14 | app:`routing_worker_test.dart`: NaN, infinite, unknown level or place give an error result; the next query is served | engine |
| EC-15 | app:`routing_worker_test.dart`: a killed worker means "unavailable" for that query; restarted for the next | engine |
| EC-16 | app:`router_service_test.dart`: two quick queries, only the newest result shown | engine |
| EC-17 | Tie vectors; app:`other_way_test.dart`: an equal-cost way is not an other way | engine |
| EC-18 | app:`other_way_test.dart`: a one-edge lead way | engine |
| EC-19 | app:`stairs_rule_test.dart` (= AC-17) | engine |
| EC-20 | app:`stairs_rule_test.dart`: the no-stairs search uses the same shortcut setting and passages | engine |
| EC-21 | Vector: one-way stairs, down only, including under the stairs rule | engine |
| EC-22 | app:`heuristic_test.dart` and vectors: a zero and a below-default connector cost | engine |
| EC-23 | app:`package_reader_test.dart` (EC-3's invalid-cost fixture); the publish side is P0-03's test | engine |
| EC-24 | Vector: a closed passage means unreachable, with the reason "⟨store⟩ is closed and it is the only way in" (Q7) | engine |
| EC-25 | Vector: the destination is a walk-through store, so the route ends at its door with no crossing leg | engine |
| EC-26 | Vector: an origin served only through a passage uses it whatever the setting | engine |
| EC-27 | app:`stairs_rule_test.dart`: the value comes from the package. Two fixture packages from two tenants' overrides; the resolution at publish is P0-03's test (Q6) | engine |
| EC-28 | api:`public.package.test.js` (= P0-04 EC-24): an unpublished draft edit leaves the served package unchanged, so the route is identical by construction | api |
| EC-29 | By hand: location denied, a route still computes from Start here (smoke row) | flutter |
| EC-30 | Covered by EC-2's test (one version at a time) | engine |
| EC-31 | api:`public.package.test.js` (= P0-04 EC-6) | api |
| EC-32 | app:`stairs_rule_test.dart`: packages with 144 and 200 each apply their own (it takes effect at the next publish, Q6) | engine |
| EC-33 | Vector: basement 2 to the top level, legs and levels in order; by hand on Aurora (AC-28) | engine |
| EC-34 | By hand: background mid-query; the result is shown on return (smoke row) | flutter |
| EC-35 | app:`route_section_test.dart`: ×1.4 wraps. The Tagalog part follows the G2 ruling (§14) | flutter |

**Existing tests that change** (C1): FF-SK's Map-placeholder test for the shopper shell becomes "Map is built" (P0-04 r2 item 1). That is the only one. The others stay as they are.

## 8. What you can run on this machine (E-20)

**Setup, once:**
1. `npm run setup-db`.
2. Publish the seeded malls with FF-3's command (P0-03 Q14 (a)).
3. Start the API: `db/seeds/node_modules/.bin/firebase emulators:start --only functions --project demo-gabay` (INSTALL.md A.1c).
4. Then, in `app/`:
   `flutter run -t lib/main_mobile.dart --dart-define=API_BASE=http://10.0.2.2:5001/demo-gabay/asia-southeast1/api --dart-define=GABAY_INTERNAL_TOOLS=true`

| What | Android emulator | Your phone over USB | How |
|---|---|---|---|
| Picker, download, SHA-256, read-only open, the 2.5D map | Yes | Yes, with `adb reverse tcp:5001 tcp:5001` and the `127.0.0.1` base (RECALLED, checked in the docs before the smoke guide cites it) | Pick Aurora |
| A route and the other way | Yes | Yes | Long-press to set the start, tap a store, Go |
| The ETag check and the 5-minute timer | Yes | Yes | Publish again from the admin page (FF-3) while the app is open; a throwaway `package.refreshCheckS` = 30 row in the local database shortens the wait; the emulator log shows the 304s |
| The swap between trips and "Map updated" | Yes | Yes | Start a route, publish, then ✕ |
| Offline | Yes: airplane mode or stop the Functions emulator | Stop the Functions emulator (airplane mode may not cut USB, RECALLED) | |
| Foreground only | Yes | Yes | Send the app to the background; the log shows no requests |
| Detection | Yes, after Aurora's invented georeference (Q4 (a)): a mock fix from the emulator's location controls (RECALLED) | Only with a mock-location app (RECALLED) | |
| Tablet layout and landscape | A tablet emulator image | If you have a tablet | |
| Speed figures | Recorded, not judged | The realme (Spike 2's phone): routing times and map frame times recorded as provisional | |
| Captive portal, Android 7.0, iOS | Tests only (fake responses); an API 24 image if one is installed (RECALLED); no iOS on this machine (P1-05) | No | |

## 9. Records

- **plan.html:**
  - FF-4's row in the L156 batch (one row per slice);
  - L-rows for: the reconciled answers (§3); P0-06 Q3 (it changes L117's order); P0-06 Q4 (amends RG2's wording, L79); the G2 Tagalog waiver (§14); the settings split (§3.3);
  - each with a version bump and a changelog row;
  - the modules page republished for the rulings.
- **FEATURE_PIPELINE:** P0-04 and P0-06 `IN PROGRESS`, with Intent, Spec, Plan and PR filled in; not `DONE` (§1).
- **PRD:** §6.4 and §6.6 as built; §7 and §6.6 gain the provisional latency target (P0-06 r2).
- **Blueprint:**
  - §4.2: RG2 restated (Q4), the one planar frame (Q5), as built;
  - §4.4: as built;
  - Part 1 pins: `sqlite3`'s exact version, `shared_preferences` read from pub.dev, `crypto`, `path_provider`, `integration_test` (SDK);
  - invariant 16's registry: `GABAY_INTERNAL_TOOLS` (build-time, fails closed: off unless defined) and `package.refreshCheckS` (a number, an invalid value uses the default);
  - Part 4 anchors as built; OQ6 provisional.
- **EXCEPTIONS:** E-21 `crypto` and E-22 `path_provider`, expiry 2027-04-02 (Q1 (a)).
- **The retrofit ledger** (PH4 §7):
  - `GET /api/public/venues` and `GET /api/public/venues/:venueId/package`: tenant context n/a (public); guard order R5 (zod); permission and menu rows n/a; audit n/a (read-only); rate limit R4; e2e R12;
  - the shopper Map tab: e2e R12.
- **Seeds:** the platform `GlobalSetting` rows; Aurora's invented georeference.
- **`settings.js`:** `DEFAULTS` and `SHOPPER_SETTINGS`.
- **ARB, changelog and screenshots:**
  - every new phrase in `app_en.arb` with a description;
  - a shopper-surface changelog entry with its ARB bullet;
  - screenshots in light and dark, phone and tablet: the picker, the tilted map, the flat map, the whole site, all levels, the place sheet, a route with the other way, and the sheet's three states.
- **Manuals:**
  - `docs/testing/E2E_Test_Cases_Manual.md`: the two public routes;
  - `E2E_Frontend_Test_Cases_Manual.md` and `Smoke_Test_Guide.md`: the picker, delivery, the map, a route, offline, the swap.
- **CLAUDE.md Commands, README and INSTALL.md:**
  - the shopper run line with `GABAY_INTERNAL_TOOLS`;
  - `adb reverse`, once checked;
  - DC-7's fixture command, if it becomes an npm script.
- **FF-SK's module registry:** Map is built.

## 10. Who and order

1. **You:** approve this plan (0.9) with P0-04 r1 and P0-06 r1 in the L156 sitting, and rule the Questions.
2. **spec-writer:** P0-04 r2 and P0-06 r2 (§4), P0-06 r2 after FF-S2 reports. **Main session:** this plan 1.0 citing both. If anything beyond the citations changes, it comes back to you.
3. In parallel, each in its own working copy on a branch from main:
   - **engine-coder:** vectors, Dijkstra, A*, the heuristic and the snap on an in-memory graph; then, after FF-3 merges, the reader, the worker and the service.
   - **api-coder** (after FF-3 merges): the routes, the settings and the seed.
   - **native-ble** (if Questions 5 is ruled as recommended): `gabay/location`.
   - **flutter-coder** (after FF-SK merges): projection, picker, delivery and map; then the trip and route section on engine-coder's result shape (fixed in §6.2, so it can start on a fake router).
4. **test-verifier** in each coder's copy: the §7 tables filled with results.
5. **dod-reviewer** on each pull request. The engine PR is high-risk: dod-reviewer and you approve before merge.
6. **Your sign-off:** three pull requests, merged in this order on your go: api, engine, then flutter (with native-ble's channel inside it or just before it).

## 11. DESIGN CHOICES (each with an alternative)

- **DC-1 The ETag is the quoted `PackageSha256`, plus a `Gabay-Package-Version` header.** The phone checks the bytes against the hash of the version it actually received. *Alternative:* the version number as ETag, with the hash taken from the list; better if the hash were expensive to read, which it is not (it is in the row).
- **DC-2 Two route files, `routes/public/venues.js` and `packages.js`, under a GET-only `index.js`.** *Alternative:* one `packages.js`, as FEATURE_PIPELINE names it; fine if the list stays tiny.
- **DC-3 One package reader, owned by engine-coder, used by both the worker and the map.** Delivery is a separate folder owned by flutter-coder. *Alternative:* the map reads geometry with its own SQL; two readers of one format drift.
- **DC-4 The map's geometry is read in `Isolate.run` with its own read-only connection.** *Alternative:* the routing worker also serves geometry, with one connection but two jobs in one isolate; better if FF-S2 shows a second connection is costly.
- **DC-5 The heuristic coefficients are derived as in §6.2.** This implements P0-06 Q4 option 1. *Alternative:* a per-level-pair table of cheapest connector costs: tighter, more code; better if FF-S2's M5 shows A* too slow with the simple bound.
- **DC-6 The vector file lives at `app/test/fixtures/routing/vectors.json`.** *Alternative:* a new top-level `test-vectors/` folder, more visibly shared, better once a server router exists (a new folder may need a ruling, L125).
- **DC-7 Fixture packages are built by FF-3's own writer from tiny venue models, with one script.** A Node test rebuilds them and compares the decoded contents with the committed files, so a format change fails verify. *Alternative:* a Dart test-only writer: no Node step, but two writers of one format.
- **DC-8 `GABAY_INTERNAL_TOOLS` is a define, off unless given.** *Alternative:* on in every non-release build, as FF-0's banner; one fewer flag to type, but a debug screenshot would show internal tools.
- **DC-9 The picker is the launch route above the shell, and picking opens the Map tab.** *Alternative:* the picker inside the Map tab; better if you want the other tabs reachable before a mall is chosen.
- **DC-10 AC-38's tolerance:** a round trip within 0.001 m (the database's `DECIMAL(9,3)`), at tilt 0–60°, rotation 0–359° and zoom 0.5–8×. *Alternative:* within half a logical pixel on screen; looser, tied to the device.
- **DC-11 Shopper settings get their own `SHOPPER_SETTINGS` allow-list, beside `PUBLIC_FLAGS`.** *Alternative:* widen `PUBLIC_FLAGS`; that mixes module gates with tuning values.
- **DC-12 The location fix is one-shot, when the picker opens.** *Alternative:* a stream while the picker is open; better when a shopper walks in with the picker showing.

## 12. Risks

- **The package format is not fixed** until FF-S2 reports and FF-3 merges. The reader is the part that would be redone; the engine is built first on an in-memory graph to limit that.
- **Map speed at mall scale is unmeasured.** A 2.5D CustomPainter at Aurora's size on the realme may drop frames. It is measured here (§3.4); there is no target to fail.
- **The background-isolate behaviour is unchecked (RECALLED).** A long-lived `Isolate.spawn` holding its own `sqlite3` connection. If the docs say otherwise, the worker design comes back to you.
- **The heuristic can degrade.** A mall setting a zero-cost connector makes the estimate 0. Routes stay correct but are as slow as Dijkstra, which shows in AC-34's times.
- **Size.** P0-04 (M) and P0-06 (L) in one slice, with flutter-coder carrying most of it (PH4's capacity note). Three PRs split the review.
- **The emulator and phone networking is unchecked** (10.0.2.2, `adb reverse`, cleartext on API 28+). It is checked before the smoke guide cites it.
- **FF-SK's shell may differ from what §4 assumes.** In that case r2 follows what FF-SK built.
- **Any non-recommended ruling** in §2 changes the named tests. Q2 and Q6 of P0-06 change the most.

## 13. Definition of done (FEATURE_PIPELINE §5)

| Item | Applies? | Line |
|---|---|---|
| 1 Schema and migration | No | No table or column changes (both specs §9). Becomes yes only if P0-04 Q8 (b) is ruled |
| 2 Seed data | Yes | Platform `package.refreshCheckS` and `routing.stairsSaveM` rows; Aurora's invented georeference |
| 3 Guard order | Waived | `Waived: 3 (guard order) — R5 (validation on the public routes)`. Public routes have no auth by design (Public-Read); P0-06 has no route |
| 4 Permission and menu rows | No | Public routes carry none by design; the shopper app has no admin menu |
| 5 Scaffolds, `formatApiError`, four states | Yes | The picker (AC-11); the route section's four states (P0-06 AC-31) |
| 6 Notifications or SSE | No | Nobody is notified; phones poll by design |
| 7 Refresh on return | Yes | The picker refreshes when you come back to it from a map |
| 8 Dark mode, no colour literals | Yes | P0-04 AC-41; the route and dotted amber from `gabay_tokens.dart` |
| 9 Automated e2e | Waived | `Waived: 9 (automated e2e) — R12; the feature's API and frontend manual cases are still written now` |
| 10 Manuals and smoke guide | Yes | §9 |
| 11 Changelog | Yes | The shopper surface's first real screens |
| 12 Sync table | Yes | API route, screen, dependency, setting, command and owner-ruling rows (§9). The schema row: no schema change |
| 13 `FieldSpec` | Yes | The picker's search only, through the shared field |
| 14 Enumerable sets | Yes | Leg kinds and result kinds in the constants file with their authority; view modes and download states are code-owned states |
| 15 Inactive lookup | No | Nothing is edited or saved; status is read as published |
| G1 Traceability | Yes | §7, filled with results |
| G2 Tagalog, screen-reader names, ×1.4 | Yes, Tagalog per §14 | Names: AC-43 and the route pills; ×1.4: AC-53 and EC-35 |
| G3 Offline, position privacy | Yes | P0-04 AC-15 and AC-29; P0-06 AC-30 |
| G4 Differences recorded | Yes | §9's L-rows |

dod-reviewer checks that each waiver names its retrofit slice, and that the ledger rows of §9 exist.

## 14. The G2 Tagalog question (P0-04 Q7)

The two specs differ:
- **P0-04 Q7 (a):** "English now; G2's Tagalog part waived to P0-14 by a ruling recorded as an L-row (it is not one of E-20's three)."
- **P0-06 §9, G2:** "New phrases … in both ARB files for the owner's review."

The repository already says English only until P0-14: `app/l10n.yaml` reads "English only until P0-14: the Tagalog app_tl.arb is added after the product owner's review (L109); it is never machine-translated". CLAUDE.md's sync table says the same ("Tagalog with P0-14").

**This draft assumes P0-04 Q7 (a), for both specs.** Every FF-4 phrase is in `app_en.arb` with a description. The Tagalog for all of them is written and reviewed with P0-14 (FF-7). The waiver line, recorded by its own L-row because E-20 allows only items 3, 4 and 9:

`Waived: G2 (Tagalog part) — P0-14 (FF-7), by the L-row recording P0-04 Q7; screen-reader names and ×1.4 are met now`

**Otherwise:**
- (b) `app_tl.arb` now, with the demo's phrase table as a draft (read, not copied, L34), and your review at FF-4's sign-off; `arb_integrity_test.dart` then enforces it.
- (c) Tagalog in the retrofit.

## Questions for the user

1. **[main session] What does Go do in a build without the Start-here tool?** Neither spec says (§3.1).
   - (a) **Recommended:** Go is shown disabled with one line, "Set where you are to get a route" (ARB), until P0-08's "Where are you?" in FF-6. Under E-20 every run is a debug build with the flag on, so you will not see this state unless you leave the flag off.
   - (b) Go hidden without the tool.
   - (c) The route starts at the mall's first marked entrance in that case (P0-04 Q5 (b) as a fallback only).
2. **[main session] How do `routing.*` settings reach the phone?** The specs' recommendations differ (§3.3).
   - (a) **Recommended:** split by key. `routing.*` only in the package at publish (P0-06 Q6, P0-03 Q12 (a)): offline and frozen with the version. Everything else (`package.refreshCheckS` now; `map.*` and `voice.*` later) in the mall list (P0-04 Q2 (a)).
   - (b) Everything in the list, `routing.*` included: a change applies without a republish, but a route can mix one version's graph with another moment's settings.
   - (c) Everything in the package: one source, but `package.refreshCheckS` would need a republish to change.
3. **[main session] Aurora's invented georeference (P0-04 Q4 (a)): at which point?**
   - (a) **Recommended:** a point you name, in an open area so nobody mistakes it for a real mall; the emulator's mock fix is then sent there.
   - (b) This office's address, so a phone at the desk could fall inside it (an invented mall over a real building).
4. **[main session] Who measures map drawing speed?** P0-04 Q10 (a) says FF-S2; the Spike 2 plan says FF-S2 does not, and that "rendering is measured in P0-04 itself" (§3.4).
   - (a) **Recommended:** FF-4 records frame times on the realme with Aurora, as provisional figures with no pass or fail; P0-04 r2's Q10 wording is corrected.
   - (b) Add rendering to FF-S2 (a change to an approved, running spike).
5. **[main session] Who writes the Kotlin location channel?** P0-04 Q1 (a) needs `gabay/location`; your FF-4 split names api-coder, engine-coder and flutter-coder only.
   - (a) **Recommended:** native-ble, the agent for Gabay's own platform channels and Android permissions (Opus; WORKING_AGREEMENT §8). It is small and one-shot.
   - (b) flutter-coder (Sonnet), with native-ble reviewing.
   - (c) Defer the channel: detection is unit-tested only until P0-13 (FF-9) brings native work anyway.
6. **[main session] The on-device tests need Flutter's `integration_test` package.** It is an SDK package like `flutter_test`, and needs a Blueprint pin row.
   - (a) **Recommended:** add it to the SDK row ("follow Flutter"), with no EXCEPTIONS entry, as `flutter_test` has none; the device runs stay by hand, with output pasted.
   - (b) An EXCEPTIONS entry as well.
   - (c) No on-device test: AC-28 and AC-34's timings are manual smoke rows only.

## RECALLED (checked in the docs before each carries weight)

- `Isolate.spawn` with `SendPort` and `ReceivePort` for a long-lived worker; `Isolate.run` for one-shot work.
- `package:sqlite3` 3.x:
  - opens a `file:` URI with `mode=ro&immutable=1`;
  - bundles SQLite with FTS5 and R*Tree on Android without a second package;
  - a connection is opened per isolate and is not sent between isolates;
  - it runs in `flutter test` on Windows.
- The exact current versions and maintainers of `crypto`, `path_provider` and `shared_preferences` 2.x (pub.dev).
- Android's own location API for a one-shot fix without Google Play services.
- Plain `http` blocked from API 28 unless the debug manifest allows it.
- `adb reverse tcp:5001 tcp:5001`.
- The emulator's mock location.
- An API 24 emulator image on this machine.
- How a widget test injects iOS reduce-motion (`AccessibilityFeatures.reduceMotion`).
