# FF-1 to FF-4 — the decision sheet (one sitting, L156)

> **Date**: 2026-10-09 | **Status**: APPROVED by Genesis Perez, 2026-10-09: every item as recommended, except E3 (§G) | **For**: Genesis Perez, product owner | **What was approved**: 5 intents (`intent/P0-01…`, `P0-02…`, `P0-03…`, `P0-04…`, `P0-06…`), 5 specs (`spec/P0-01.md`, `P0-02.md`, `P0-03.md`, `P0-04.md`, `P0-06.md`, each r1) and 4 plans (`plan/FF-1-venue-setup.md`, `FF-2-test-seeds.md`, `FF-3-publish-engine.md`, `FF-4-shell-routing.md`, each 0.9). Every question the spec-writers and the plans raised is below, de-duplicated. The **recommended** answer is in bold, and each plan was drafted assuming it. Each question's other options and reasons are in the spec or plan named.

## A. Questions shared by several documents (answered once, applied to all)

| # | Question | Recommended | Where |
|---|---|---|---|
| A1 | Where a route starts in FF-4, before any position source | **A "Start here" long-press, in internal builds only, snapped to the walkway; P0-08 (FF-6) removes it.** Without that tool, Go is shown disabled with "Set where you are to get a route" | P0-04 Q5, P0-06 Q1, FF-4 Q1 |
| A2 | Who owns the route sheet | **P0-04 owns the sheet container, the place sheet with Go, the map drawing and the level chips; P0-06 owns the route section and its ViewModel. In FF-4 only ✕ ends a trip (arrival is P0-06 r3)** | P0-04 Q11, P0-06 Q9 |
| A3 | How settings reach the phone | **Split by key: `routing.*` only inside the package (fixed at publish, works offline); everything else (now `package.refreshCheckS`) in the public mall list** | P0-04 Q2, P0-06 Q6, P0-03 Q12, FF-4 Q2 |
| A4 | Tagalog now? (G2) | **English now; the Tagalog part of G2 waived to P0-14 (FF-7), recorded in the slice row; screen-reader names and ×1.4 met now** | P0-04 Q7 |
| A5 | Spike 2 and the latency target | **Approve the specs now without a target. FF-S2 reports before FF-3's stage B and FF-4 starts; P0-06 r2 adds the measured target as a provisional setting (this changes L117's order)** | P0-06 Q3, P0-03 Q1–Q2 |
| A6 | Who measures map drawing speed | **FF-4 records frame times on the realme as provisional figures (Spike 2 does not render, L83)** | P0-04 Q10, FF-4 Q4 |
| A7 | **The A\* estimate (RG2) can overestimate** (escalators with a horizontal run; lifts over several levels), so a route might not be the shortest | **Keep RG2's shape, but derive both coefficients from the package's own edges at load, so it never overestimates; an L-row amends RG2's wording** | P0-06 Q4 |
| A8 | Re-seeding after a publish fails (published versions are frozen) | **The seed checks first and stops with "run `npm run setup-db`"; then `publish:dev --all` republishes** | FF-2 risk, FF-3 Q1 |
| A9 | The package lacks two things routing needs | **Add connector names and an R\*Tree over wall segments to the package, noted in both specs** | FF-3 Q2 |
| A10 | Seeing Spike Venues in the admin page | **Settled by FF-SK ruling 3 (the switcher picks the tenant); the specs note it** | P0-02 Q1, FF-1 Q3 |

## B. FF-1 — venue, building and level setup (P0-01)

| # | Question | Recommended |
|---|---|---|
| B1 | Decimal fields (7 columns; S9 has no decimal kind) | **Add `ColKind.decimal` alone in FF-1 (widens S9's bound; recorded in the slice row)** |
| B2 | The venue boundary (needs drawing, FF-10) | **No form field: the service stores a rectangle covering the largest level until the admin draws one in FF-10** |
| B3 | Refresh on return (item 7) | **Add it to the shared list machinery in FF-1** |
| B4 | Removing records | **Venues get an Active switch, no delete; buildings and levels delete only when nothing uses them, otherwise a 409 names what does** |
| B5 | Two admins editing one record | **Optimistic check on `UpdatedAt` → 409** |
| B6 | Extra level fields | **Add ElevationM and CeilingHeightM; WidthM and DepthM above 0; checked in the service and form** |
| B7 | Level rules | **Distinct ordinals per building; at most one outdoor ground level per venue at ordinal 0; checked in the service** |
| B8 | Nested interiors and amenity/transit types | **Nothing in FF-1; they come with FF-10** |
| B9 | Role access (applied at R2) | **SUPERADMIN and MALL_ADMIN full; VENUE_EDITOR edits buildings and levels in granted venues; VIEWER reads only** |
| B10 | "Full end-to-end" for item 15 | **The integration test, widget test and manual case; the server also refuses a new reference to an inactive type** |
| B11 | List details | **Search venues by Code and Name, buildings by Name, levels by Name and ShortName; sort by Name, levels by Ordinal highest first; codes stored as typed** |
| B12 | Count targets | **None beyond paging and PRD §7** |
| B13 | The L117 coder-model trial (Sonnet and Opus each build P0-01) | **Server half only: test-verifier writes the server tests first; Opus 5.5 then Sonnet 5.5 build in turn; cost, first-time verify, review rounds and findings measured; you pick the branch merged** |
| B14 | Hiding writes for VIEWER and VENUE_EDITOR before R2 | **Hide New, Save and Delete in the client from the registry's read-only marker; the server is unchecked until R2** |
| B15 | If FF-SK has not merged when FF-1 starts | **The server half starts; the client half waits for FF-SK** |

## C. FF-2 — test seeds, finished (P0-02)

| # | Question | Recommended |
|---|---|---|
| C1 | Stable beacon Majors for your exports | **Keep name order, print each venue's Major, revisit at FF-9** |
| C2 | An export the seed cannot use | **Skip that file with one line saying why, seed the rest, exit 0** |
| C3 | Your exports in git? | **No: ignore `sources/spike-exports/*.json` like `internal/`** |
| C4 | Landmarks (Anchor rows) | **None in P0-02; FEATURE_PIPELINE corrected** |
| C5 | A seed run-time target | **None; verify's 10-minute cap stands** |
| C6 | H2 "−30 dBm" vs the seed's −55 | **−30 dBm is transmit power; keep −55 measured power; FEATURE_PIPELINE wording clarified** |
| C7 | AC-20's "no `.env` value in output" vs printed emails | **Search only secret values (`SEED_PW_*`, `PGPASSWORD`, keys ending `_PASSWORD`, `_SECRET`, `_KEY`, `_TOKEN`); spec r2 wording** |
| C8 | AC-14's "row unchanged" vs FF-1 stamping UpdatedAt | **Compare every column except `UpdatedAt` and `UpdatedBy`; spec r2** |
| C9 | Coder copies get no exports once git-ignored | **Leave it; tests use invented fixtures** |
| C10 | P0-02's status after FF-2 | **IN PROGRESS until FF-3 publishes the seeded venues** |

## D. FF-3 — publish engine (P0-03)

| # | Question | Recommended |
|---|---|---|
| D1 | What starts before Spike 2 | **Everything except the package writer's format (stage A now, stage B after FF-S2)** |
| D2 | Where packages go | **A git-ignored local folder; `StoragePath` holds a key shaped like the future Cloud Storage path; the move to Cloud Storage gets a ledger row closed at the deploy call** |
| D3 | A refused publish | **Leaves no row; FAILED only for build errors; the request waits; the stuck-publish limit is a setting sized from Aurora's time** |
| D4 | What counts as a wall | **Non-walkable unit outlines except at their doors; walkways through blocking floor objects are refused too** |
| D5 | "Every store reachable" | **Occupants, amenities, transit points and anchors; from an entrance and back; everyday connectors only; no step-free check at publish** |
| D6 | Same-height levels (outdoor ground, footbridges) | **Joined automatically wherever walkways touch** |
| D7 | A lift's rise | **From the levels' height difference; `RiseM` not required on lifts** |
| D8 | Coverage and collinear-beacon warnings | **Ship only "no beacons on this level" until Spike 1's figures exist** (the alternative is numbers you give now) |
| D9 | D9's per-floor beacon range check | **Not yet** |
| D10 | A place reachable only through either of two walk-through stores | **Both become passages** |
| D11 | The package allow-list | **Confirm, with the routing settings resolved at publish (A3) and the A9 additions** |
| D12 | What draws the admin's map | **`flutter_map`, with E-04 widened from "flat editor" to "the admin's flat maps"; generated walkways drawn after a publish** |
| D13 | Publishing the seeded venues | **A development command for any tenant, plus the screen; MEZZ and the penthouse stay refused until FF-10 confirms their doors** |
| D14 | Size and time limits | **Measure and report; above ~20,000 nodes or 3 MB a warning, never a refusal** |
| D15 | The spec's design choices DC-1 to DC-13 | **Accept all** |
| D16 | A read route for a level's drawing | **Add `GET /api/venues/:venueId/levels/:levelId/drawing[?versionNo=n]`, with its ledger row** |

## E. FF-4 — shopper shell and routing (P0-04, P0-06)

| # | Question | Recommended |
|---|---|---|
| E1 | Device packages not pinned (hashing, a folder, location) | **`crypto` and `path_provider`, each pinned with EXCEPTIONS entries E-21 and E-22; location through Gabay's own platform channel** |
| E2 | Launch and switching malls | **The picker opens every launch; a detected mall shows on top as "You're here", else the last venue; location asked the first time; switching mid-route asks first** |
| E3 | Making detection testable | ~~Give the Aurora seed an invented georeference~~ **Ruled otherwise (§G): no georeference for the Demo Malls test maps; detection is built as specified and tested with fixtures** |
| E4 | How much of P0-04 this revision covers | **The intent plus what the container needs, on FF-SK's shell; P0-04 marked done only when its last revision lands** |
| E5 | Wing shortcuts | **One per building, labelled with its name** |
| E6 | Delivery details (seven) | **All as in the spec's §11: a held mall stays usable, marked "No longer updated"; a too-new format shows "Update Gabay"; keep one package per mall; check at once on return after an interval; inactive tenants and venues are not listed; keep the camera and level after a swap; no notice for a stale package offline** |
| E7 | The picker's mall cards | **Name, building and level counts, the boundary outline; a thumbnail once downloaded** |
| E8 | Recentre with no position | **Hidden until a position exists** |
| E9 | Where P0-06's deferred parts go | **P0-06 r3, built in FF-6 with P0-08; live-dot parts proven again in FF-9** |
| E10 | One planar frame | **One frame per venue** |
| E11 | A closed passage store | **The places behind it are unreachable, and the reason is shown** |
| E12 | The lead way's label when the stairs rule demotes a shorter stairs way | **"Recommended (N m)"** |
| E13 | Who writes the Kotlin location channel | **native-ble** |
| E14 | On-device tests (`integration_test`) | **Add to the Blueprint's SDK pin row (an SDK package, no EXCEPTIONS entry); device runs by hand with output pasted** |

## F. What the batch records

One `plan.html` row per slice (L156), holding that slice's rulings:
- FF-SK (the dashboards, already approved);
- FF-S2 (Spike 2, already approved);
- FF-1;
- FF-2;
- FF-3;
- FF-4.

A7 amends RG2's wording, and A5 changes L117's order. Both are recorded in the FF-4 row. After you approve, each spec moves to its r2 wording where a ruling says so, and each plan to 1.0.

## G. Rulings beyond the recommendations (2026-10-09, the product owner)

1. **E3, the Demo Malls test maps run on the fallback.** In the owner's words: "for that map only, for the real maps, the ble's are of course included". The Demo Malls venues (Aurora and the others, which have no beacons) get no invented georeference. On them the app runs on the fallback: pick the mall, a hand-set start, "Where are you?" (P0-08) and the guided walk (P0-15), so a BLE or positioning failure never makes the app useless. Real venues keep BLE positioning (P0-13) and detection by location, unchanged. Mall detection is still built in FF-4 as P0-04 specifies, verified with fixtures until a real venue carries its georeference. The location channel (E13, native-ble) and E1's exceptions stand.
2. **B13, the coder-model trial:** as recommended. The server half of FF-1 is built twice, by Opus 5.5 and then Sonnet 5.5, against tests test-verifier writes first, and the owner picks the branch merged.
3. **FF-1, decimals typed as ".5" or "5."** are refused on both sides, and the field's hint shows "0.50" (api-coder's question 1; as recommended).
4. **FF-1's server review (api-coder, read-only, before approval), fixed without a ruling (L156):** the venue lock is `FOR NO KEY UPDATE`, not `FOR UPDATE`, which would block other inserts under the venue (checked on the local database). The two deletes take the same lock. The level list also binds `VenueId`. The plan states which decimal columns are required, says no test fires concurrent requests through one savepoint connection, adds a test for the degenerate boundary, rejects id 0 up front, and builds the foreign-key noun table from `schema.sql`.
