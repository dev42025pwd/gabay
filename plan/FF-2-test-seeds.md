# FF-2-test-seeds — P0-02: the test venue seeds and accounts, finished (E-20)

> **Version**: 1.0 | **Date**: 2026-10-09 | **Status**: APPROVED by Genesis Perez, 2026-10-09 (the FF-1 to FF-4 batch, L156; `plan/FF-1-4-decisions.md`) | **Pipeline entry**: P0-02 | **Spec**: `spec/P0-02.md` r2; also cites `spec/P0-01.md` r2 (FF-2 is built after FF-1 is merged and checks the seed through FF-1's routes) | **Parent**: `plan/PH4-feature-first.md` 1.0 §4, the FF-2 row (L153, EXCEPTIONS E-20); `plan/FF0-dev-stub-lookups.md` 1.0 (L154); `plan/FF-SK-dashboards.md` 1.0 (ruling 3); `plan/FF-3-publish-engine.md` (`publish:dev`, DC-P17) | **Approver**: Genesis Perez, product owner

## 1. What FF-2 delivers

L120 already built the seed (`db/seeds/`). FF-2 finishes it, as spec r2's §2 lists:

1. **Fit to P0-01 as built in FF-1.** The seeded venues, buildings and levels show in FF-1's admin lists through the development stub, and pass FF-1's own validation unchanged (AC-13 to AC-15).
2. **The owner's spike exports, defined.** With none: one line and a normal commit (spec §3). With valid ones: a venue each. With an unusable one: that file is skipped with a line naming it and why (AC-25, C2). Exports stay out of git (C3).
3. **Tests of what the seed writes,** not only its exit code (spec §2.3; FEATURE_PIPELINE §5.4 "seeds are deterministic"). This includes the AC-2 totals test against L120's recorded run.
4. **A re-seed after a publish stops cleanly** (AC-23, A8). The seed checks first, before any write. If a test tenant holds a version, it names the tenants and the way out (`npm run setup-db`, then `npm run publish:dev -- <TENANT_CODE> --all`) and exits non-zero. It never switches off the frozen-version rule.
5. **No georeference on the Demo Malls venues** (AC-24, G1). The test malls run on the shopper app's fallback; real venues keep BLE.
6. **Records:** the seed README, the manuals and smoke guide rows, and the pipeline entry.

**What you can see after it (localhost):**
- After `npm run seed`, the admin page's venue list shows Demo Malls' four malls.
- Through FF-SK's switcher, choosing `malladmin@` with the Spike Venues tenant shows MEZZ office, plus the penthouse on your machine and your exports once you add them.

**Not in FF-2** (spec §8):
- publishing any seeded venue (FF-3), and the `publish:dev` command itself (FF-3, DC-P17);
- confirming spike doors (FF-10);
- anchors (C4);
- any change to the stub, the lookups route or `seed:db-only`'s account handling;
- deleting or unfreezing published versions (A8).

## 2. The spec's questions and this plan's (ruled 2026-10-09)

Every question was ruled as recommended in `plan/FF-1-4-decisions.md` (APPROVED). The 0.9 assumptions now stand as rulings. Nothing below is open.

| Question | Ruling | Applied in |
|---|---|---|
| Spec Q1: how you see Spike Venues | A10, FF-SK ruling 3: the switcher picks the account and, for accounts holding two tenants, the tenant. FF-0 is not amended. If FF-SK is not merged when FF-2 is built, AC-15's Spike Venues half is checked by API only (AC-13), and its smoke row waits | AC-12, AC-15 |
| Spec Q2: stable Majors | C1: name order from Major 3, printed per venue, revisited at FF-9 | §3.3, AC-8 |
| Spec Q3: an unusable export | C2: skip it with one line, seed the rest, exit 0 | §3.3, AC-25 |
| Spec Q4: exports out of git | C3: `.gitignore` gains `/db/seeds/sources/spike-exports/*.json` | §3.3, AC-22, §6 |
| Spec Q5: anchors | C4: none; FEATURE_PIPELINE's description is corrected | §6 |
| Spec Q6: run-time target | C5: none; verify's 10-minute cap stands. The measured time is still reported | §5 |
| Spec Q7: the H2's −30 dBm | C6: it is transmit power, which has no column; `MeasuredPower` stays −55 dBm at 1 m | AC-4, §6 |
| Plan 0.9 Q1: AC-20's scope | C7: search only secret values | AC-20 |
| Plan 0.9 Q2: AC-14 and the audit stamps | C8: compare every column except `UpdatedAt` and `UpdatedBy` | AC-14 |
| Plan 0.9 Q3: exports in coder copies | C9: leave it; the tests use invented fixtures | Edge cases |
| Plan 0.9 Q4: P0-02's status | C10: IN PROGRESS until FF-3 publishes the seeded venues | §6 |
| Re-seed after a publish | A8: check first, stop, `setup-db` then `publish:dev --all` | §3.4, AC-23 |
| Test malls' georeference | G1 (§G ruling 1, replacing E3): none; the fallback for the test malls; real venues keep BLE | §3.5, AC-24 |

`publish:dev`'s rule for an unknown code (P0-03 r2 Q17 (a)): it names the code, publishes nothing and exits non-zero. So a mistyped code in AC-23's way out cannot pass silently. FF-2 only prints the command; it is FF-3's to build.

## 3. The work (api-coder)

### 3.1 Before starting

- Check FF-1 as merged against `spec/P0-01.md` r2. If FF-1 added a table or a NOT NULL column the seed must fill, **stop**: P0-02 needs r3 first (spec r2, the P0-01 note).
- FF-0 and FF-1 must be merged. FF-SK is needed only for the switcher path (§2). FF-3 is not needed: AC-23's tests insert `VenueVersion` rows themselves (D14).

### 3.2 The seed as a library (no behaviour change)

- **`db/seeds/lib/run.js`, `runSeed(client, options)`.** It does the seed's work inside the caller's transaction, in this order:
  - the AC-23 check (§3.4);
  - remove the two tenants and six accounts;
  - platform rows, tenants, venues, accounts.
  
  It never runs BEGIN, COMMIT or ROLLBACK, and returns the per-venue counts. Options:
  - `sourcesDir` (default `db/seeds/sources`);
  - `withAccounts`;
  - `log` (default `console.log`).
  
  Every query passes a params array, so FF-1's API tests can hand it the `functions` database object.
- **`seed.js` becomes the thin command.** Its `main({ connect, argv, out, err })`:
  - opens the client;
  - runs BEGIN, `runSeed`, then COMMIT;
  - on any other error, runs ROLLBACK and prints `Seed rolled back: <message>`;
  - **returns** the exit code. The file's last line sets it as `process.exitCode`.
  
  The printed lines are unchanged except the new ones in §3.3 and §3.4.
- **`lib/accounts.js`** reads `FIREBASE_AUTH_EMULATOR_HOST` when it makes the call, not when the file loads. That lets a test point it at a fake emulator (D4).

### 3.3 The exports handling and its log lines (AC-7, AC-8, AC-25)

- **No exports** (the folder is missing, empty, or holds no `.json`): one line, then the normal commit and exit 0:
  `Spike Venues · no spike exports found: put the spike app's .json exports in db/seeds/sources/spike-exports/ and run npm run seed again.`
- **Each `.json` export is checked before anything is written.** The checks cover AC-25's kinds:
  1. it parses as JSON;
  2. its shape is the spike's bundled-asset format: `extent.width` and `extent.height` above 0, and each of `rooms`, `doors`, `obstacles` and `beacons` either missing (counted as empty) or an array;
  3. `name` is a string of 1 to 200 characters (`Venue.Name`). The code is cut to 40 characters by AC-8's rule, so it cannot exceed its column;
  4. its `SPIKE_` code does not clash with an earlier file's (D9);
  5. there are no duplicate Minors;
  6. when it has beacons, `spikeUuid` equals the Spike Venues tenant's UUID.
- **A failed check skips the file** with one line, then the seed goes on:
  `Spike Venues · skipped spike-exports/<file>: <reason>; fix or remove it and run npm run seed again.`
  The reason is fixed text, one per kind: "not valid JSON", "not a spike venue export", "name longer than 200 characters", "same venue code as <earlier file>", "duplicate beacon Minor", "beacon UUID is not Spike Venues'". It never contains file content beyond file names.
- **A savepoint around each export** (D7). A database refusal the checks did not foresee rolls back only that file. It is reported with the same line, with the reason "the database refused it (<constraint name>)".
- **Majors** follow C1: name order from 3, by the file's slot among all `.json` files, skipped ones included (D8). The existing per-venue line prints `(Major N)`.
- **Codes** follow the existing AC-8 rule: `SPIKE_` plus the upper-cased name, with any run of other characters turned into `_`, cut to 40 characters.
- **`.gitignore`** gains `/db/seeds/sources/spike-exports/*.json` (C3).

### 3.4 The re-seed stop (AC-23, A8)

- **The check comes first** in `runSeed`, before any delete, insert or Auth emulator call. It is the same code path for `npm run seed` and `seed:db-only`.
- **The query:**
  `SELECT t.Code FROM gabay.Tenant t WHERE t.Code = ANY($1) AND EXISTS (SELECT 1 FROM gabay.VenueVersion v WHERE v.TenantId = t.TenantId) ORDER BY t.Code`
  It is bound to the two seed tenant codes, and counts any version, in any status.
- **If any code comes back,** `runSeed` throws a `SeedStopped` error. `main()` rolls back (nothing was written), prints the error's one line without the "rolled back" prefix (D13), and returns 1. For example, with both tenants:
  `Seed stopped: DEMO_MALLS, SPIKE_VENUES hold published venue versions, which are never deleted. Run npm run setup-db (it recreates every table and re-seeds), then npm run publish:dev -- DEMO_MALLS --all and npm run publish:dev -- SPIKE_VENUES --all to publish again.`
  The line names only the tenant codes that hold versions. Its wording is the spec's DESIGN CHOICE (AC-23).
- **A version in any other tenant** does not stop the seed. The seed never deletes, updates or disables anything about `VenueVersion` or `TR_VenueVersion_Frozen`.
- **No one meets the line before FF-3,** because only FF-3 writes versions. verify's own `seed` check never meets it, because the schema runs come first (spec §5).

### 3.5 No georeference on Demo Malls (AC-24, G1)

`lib/demo.js` already leaves `Venue.GeoreferenceJson` unset, so it is NULL (the column is `JSONB NULL`, schema 0.14). FF-2 adds:
- a one-line comment there naming G1;
- the AC-24 test.

No other code changes.

### 3.6 Fit to FF-1

- Run AC-14's round-trip test against FF-1 as merged. Any seeded value that FF-1's validation refuses is fixed in the seed, not in FF-1 (the seed follows P0-01). The rules to check, from P0-01 r2:
  - `WidthM`, `DepthM` and `CeilingHeightM` above 0 (AC-11, B6);
  - one outdoor ground level per venue, at ordinal 0 (AC-12, B7). The seed already writes one, at ordinal 0;
  - distinct ordinals within a building (AC-35, B7);
  - `ShortName` of 10 characters or fewer.
- **The boundary (P0-01 r2 AC-34, B2).** The server re-derives the venue boundary after every level save, as a rectangle from (0,0) to the largest level's `WidthM` × `DepthM`. Every demo `siteRect` and every spike extent starts at (0,0) (checked in the sources this session), so the shapes match. If FF-1's polygon JSON differs from `geo.rectPolygon`'s (vertex order, closing point), the seed writes FF-1's form. That way a level round trip leaves the venue row unchanged too, and AC-14 checks this.
- **Stop and ask** if any such fix would change AC-2's totals.

### 3.7 The tests and the check

- **The tests** are in §4. Every test that writes does so inside a transaction that is always rolled back (WORKING_AGREEMENT §5, L151). No test ever commits.
- **The commands:** `db/seeds/package.json` gains `"test": "node --env-file=../../.env --test \"test/**/*.test.js\""`. The root `package.json` gains `"seed:test": "npm --prefix db/seeds test"`.
- **The new verify check, `seed-tests`** (`npm --prefix db/seeds test`, `{ tests: true }`), sits after `db-tools-tests` and before `seed`. The schema exists by then, and no seed has been committed.
- **CI:** `e2e.yml`'s `--only` list gains `seed-tests`. That workflow already runs `npm ci --prefix db/seeds` and writes a `.env`.
- **Existing tests that change** (C1). Each changes because spec r2 §2.3 asks for seed tests and §6 item 12 names `tools/verify.js` when a check is added:
  - `tools/test/verify.test.js`: the check list gains `seed-tests`, and so does its "needs the schema" list;
  - `tools/test/workflows.test.js`: the expected e2e `--only` list gains `seed-tests`;
  - `tools/test/workflow-snapshots/e2e.yml.snap`: it follows the `e2e.yml` change.

## 4. Tests first: traceability (G1)

**Failing first.** The new lines, the exports handling, the AC-23 stop and the round trip do not exist yet, so their tests must fail first. Tests of the existing behaviour may pass at once: AC-1 to AC-5, AC-10, AC-11, AC-17 to AC-19 and AC-24. The report says which.

**Shared helpers** (`db/seeds/test/helpers.js`):
- **A nesting adapter (D2).** The test holds one `pg` client inside BEGIN. The adapter turns the seed command's BEGIN, COMMIT and ROLLBACK into SAVEPOINT, RELEASE and ROLLBACK TO, and makes `end()` do nothing. So `main()`'s real commit, rollback and stop paths run, and nothing is kept.
- **A fake Identity Toolkit server (D4)** for `accounts:signUp` and `accounts:signInWithPassword`, with `EMAIL_EXISTS` and a wrong-password reply. It counts the requests it receives.
- **A temporary sources folder (D3):** a copy of the committed `demo/` and `spike/` files plus whatever the case adds. The real `sources/` folder is never written.
- **A per-tenant snapshot:** row counts of every table in the seed's delete list plus `VenueVersion`, and the codes, keyed by `Tenant.Code` so new ids do not matter.
- **Each test file seeds once** in a `before` hook, and each case runs in its own savepoint.

**Files:**
- `db/seeds/test/seed.content.test.js`
- `db/seeds/test/seed.sources.test.js`
- `db/seeds/test/seed.reruns.test.js`
- `functions/test/seed.visible.test.js`: FF-1's real routes and the stub, seeded into `openRolledBackDb` by requiring `db/seeds/lib/run.js` (D6)
- `tools/test/seed-privacy.test.js`: runs git with the `clean-git-env` helper (INC-001)

| Spec r2 item | Test | Verifies |
|---|---|---|
| AC-1 | `seed.content`: "Demo Malls has the four venues and no beacon" | `DEMO_MALLS` is "Demo Malls" with UUID NULL; its codes are `AURORA`, `BAYVIEW`, `MERIDIAN` and `SPIRE`; each name equals its source JSON's `name`; it has 0 `Beacon` rows |
| AC-2 | `seed.content`: "Demo Malls totals equal L120's recorded run" | Per Demo Malls tenant: `Level` = 66, `Unit` = 2,320, `Occupant` = 1,709, `NavConnector` = 163. The constants carry a comment naming L120. On failure the message says "differs from L120's recorded run: report to the product owner, never re-baseline" |
| AC-3 | `seed.content`: "no seeded name contains IMAX" | `ILIKE '%imax%'` over every `Name` and `SearchKeywords` column of the seeded tables, in both test tenants (D11): 0 rows |
| AC-4 | `seed.content`: "MEZZ office and its beacons" | `SPIKE_VENUES` is "Spike Venues" with UUID `87872435-5008-4e48-bd54-a7c561c885c3`. `MEZZ_OFFICE`'s beacons equal `mezz.json`'s: Major 2, the same Minors, `IBEACON_STATIC`, `MOKO_H2`, and `MeasuredPower` equal to the file's value at 1 m (C6) |
| AC-5 | `seed.sources`: "penthouse absent: skip line, commit, exit 0" | With no `internal/` in the temporary sources: the existing skip line, naming `sources/internal/penthouse.json` and L123. The other venues are written, RELEASE is reached, and `main()` returns 0 |
| AC-6 | Manual on your machine (a smoke-guide row), plus the stand-in test `seed.sources`: "penthouse present: PENTHOUSE on Major 1" | The stand-in is `mezz.json` copied at test time into the temporary folder as `internal/penthouse.json`. It is invented data, never the real file (L48), and never committed. Expected: `PENTHOUSE` on Major 1, MEZZ office still on Major 2 |
| AC-7 | `seed.sources`: three cases (no folder, empty folder, README only) | The §3.3 line appears exactly once; RELEASE; `main()` returns 0 |
| AC-8 | `seed.sources`: "a valid export becomes SPIKE_<NAME>" | Invented fixtures in `db/seeds/test/fixtures/exports/`. `Test Kiosk Lane.json` becomes `SPIKE_TEST_KIOSK_LANE`; a 60-character file name gives a 40-character code. Majors are 3 and 4 in name order, each printed; doors are marked by the AC-9 rule |
| AC-9 | `seed.content` and `seed.sources`: "NeedsReview equals the source's unsure or orphan doors" | Per spike venue, the count of `Opening.NeedsReview` equals the source's doors with a confidence other than "high", or that lead to a room the source never drew. Demo Malls: 0 |
| AC-10 | `seed.reruns`: "six accounts, five AppUser, eight UserRole, one ShopperAccount" | With the fake emulator, each `FirebaseUid` equals the UID the emulator returned. The role rows are exactly L119's: superadmin has a NULL tenant; malladmin.demo is in Demo Malls only. The real emulator half is verify's `seed` check plus a smoke row |
| AC-11 | `seed.reruns`: "venue grants" | Each tenant-scoped account has a `UserVenueGrant` for every venue of each of its tenants. Superadmin has none |
| AC-12 | `seed.visible` (API): "malladmin.demo cannot reach Spike Venues" | malladmin.demo has no `UserRole` or `UserVenueGrant` row in Spike Venues. With the stub acting as `malladmin.demo@gabay.test` through `testConfig({ DEV_STUB_USER_EMAIL })`, and `X-Tenant-Id` naming Spike Venues, FF-1's venue list answers 403. A second case uses FF-SK's `X-Dev-Act-As` once FF-SK is merged |
| AC-13 | `seed.visible` (API): "the venue list per tenant" | As malladmin@ with no header: exactly the four Demo Malls codes. With `X-Tenant-Id` naming Spike Venues: `MEZZ_OFFICE`, and no Demo Malls code. The penthouse and exports are absent from the test's sources and are covered by AC-6 and AC-8 |
| AC-14 | `seed.visible` (API): "every seeded venue, building and level round-trips" | Each row is read through FF-1's GET and sent back unchanged through its update route. Each answers 200 with no validation error. Every column equals its value before the save, except `UpdatedAt` and `UpdatedBy` (C8). The venue's row, boundary included, is also unchanged after its levels' saves (§3.6) |
| AC-15 | Manual: frontend manual and smoke-guide rows | The venue list shows the four Demo Malls venues; opening one shows its buildings and levels. Through FF-SK's switcher, malladmin@ with Spike Venues shows MEZZ office (A10). FF-1 owns the widget tests of its screens, FF-SK those of the switcher |
| AC-16 | `seed.visible` (API): "building types per tenant" | Demo Malls: `MAIN`, `WING`, `ANNEX` and `PARKING`, plus exactly the tenant rows the seed made. The README names OPEN_AIR, ARENA and STATION (D12); if the first run finds another set, stop and report. Spike Venues: the four platform rows only |
| AC-17 | `seed.reruns`: "two runs back to back" | `main()` runs twice through the adapter with no version in either test tenant. Both return 0, and the per-tenant snapshot (counts and codes) is equal |
| AC-18 | `seed.reruns`: "hand-made rows go; others stay" | Before a run, the test inserts a venue, a building, a level and a tenant `BuildingType` in each test tenant, plus another tenant with a venue. After the run, the hand-made test-tenant rows are gone. The other tenant's rows and every platform lookup are unchanged, and the run returned 0 |
| AC-19 | `seed.reruns`: "a failed run leaves the last good run" | After a good run, `SEED_PW_SHOPPER` is removed. The snapshot equals the first run's, the error names `SEED_PW_SHOPPER`, and `main()` returns 1 |
| AC-20 | `seed.reruns`: "no secret value in any output" | Every `SEED_PW_*`, `PGPASSWORD` and any key ending `_PASSWORD`, `_SECRET`, `_KEY` or `_TOKEN` is set to a long throwaway marker (C7). Everything `out` and `err` received is searched for every marker. The outputs searched: the good run, the AC-19 run, the wrong-password run, an AC-23 stop and an AC-25 skip. Assertion messages name the key, never the value |
| AC-21 | `tools/test/seed-privacy`: "the penthouse is ignored and untracked" | `git check-ignore` reports `db/seeds/sources/internal/penthouse.json`, and `git ls-files db/seeds/sources/internal` is empty. The third bullet is the `REVIEW.md` privacy pass (dod-reviewer) |
| AC-22 | `tools/test/seed-privacy`: "exports are ignored" | `git ls-files db/seeds/sources/spike-exports` lists only `README.md`, and `git check-ignore` reports `db/seeds/sources/spike-exports/x.json` |
| AC-23 | `seed.reruns`: "a version in a test tenant stops the seed" | After a good run, the test inserts a `FAILED` `VenueVersion` in Demo Malls. Then `main()` returns 1 and prints exactly one line, which names `DEMO_MALLS`, `npm run setup-db` and `npm run publish:dev -- DEMO_MALLS --all`. The snapshot is unchanged, and the fake emulator got 0 requests (the check ran before any write) |
| AC-23 | `seed.reruns`: "a published version stops it too, naming both tenants" | A `PUBLISHED` version (with its `StoredFile` row, as `CK_VenueVersion_Published` needs) in Spike Venues and a `FAILED` one in Demo Malls. The line names `DEMO_MALLS, SPIKE_VENUES` in code order; `main()` returns 1. The rows are rolled back with the test: the frozen trigger fires on UPDATE and DELETE only, never on rollback |
| AC-23 | `seed.reruns`: "the same stop with --no-accounts" | `seed:db-only`'s path stops the same way |
| AC-23 | `seed.reruns`: "a version in another tenant does not stop the seed" | A test-made tenant holds a venue and a `PUBLISHED` version. The seed returns 0 and RELEASE is reached; that tenant's version and venue are unchanged |
| AC-24 | `seed.content`: "Demo Malls venues have no georeference" | `GeoreferenceJson IS NULL` for all four Demo Malls venues |
| AC-25 | `seed.sources`: one case per kind, each an invented fixture next to one valid fixture | The kinds: (1) invalid JSON; (2) the wrong shape (no `extent`); (3) a name of 201 characters; (4) two file names giving one code (`kiosk-a.json`, `kiosk a.json`), where the later one is skipped and names the earlier; (5) duplicate Minors; (6) a beacon UUID that is not Spike Venues'. Each case: exactly one skip line naming the file and its fixed reason; the valid fixture is seeded with its slot's Major; RELEASE; `main()` returns 0. The code length is bounded by the cut at 40 (AC-8's 60-character case). One more case: a database refusal inside an export's savepoint gives the same line, and the rest is seeded |

**Edge cases (spec r2 §5)**

| Edge case | Test or reason |
|---|---|
| No exports | AC-7 |
| Penthouse source absent | AC-5 |
| Coder copies have no exports (C9) | AC-7 covers a copy's state; nothing else changes |
| An export that cannot be used | AC-25 |
| A new export added later (C1) | `seed.sources`: `b.json` alone gets Major 3; with `a.json` added, `a` gets 3 and `b` gets 4, and both are printed |
| An export with no rooms, doors or beacons | `seed.sources`: an invented fixture seeds its venue, building and "Floor 1" level with no error |
| Maximum data (Aurora, Spire) | AC-2 |
| Tenant boundary | AC-12, AC-13 and AC-16; AC-17's per-tenant snapshot; AC-23's other-tenant case |
| Each role | AC-10 and AC-11 for the rows. No role-behaviour test: roles are not enforced until R2 (E-20) |
| Permission denied | AC-12 |
| The stub's user is missing after `seed:db-only` | No test: unchanged and documented (CLAUDE.md) |
| Stale ids after a re-seed | P0-01's own not-found test |
| Concurrent edits | AC-19 covers the all-or-nothing part. No test of the interleaving: its timing cannot be made deterministic without a test-only hook |
| Two seeds at once | A manual smoke step: port contention on a shared machine is not reproducible in CI |
| The emulator account exists with another password | `seed.reruns`: the fake emulator refuses the password. The message names both fixes; the run rolls back; `main()` returns 1 |
| `.env` missing, or a `SEED_PW_*` under 6 characters | `seed.reruns`: a 5-character key gives the message naming the key, then a rollback. A missing `.env` is Node's own `--env-file` behaviour, so it has no test |
| verify wipes hand-made data | No test: P0-02 does not change it (E-20 rule 3) |
| Re-seed after a publish | AC-23 |
| A publish during a seed run | No test of the interleaving, for the same reason as concurrent edits. The seed's delete fails, AC-19's rollback applies, and the next run meets AC-23 |
| Offline or stale package | No test here: the seed writes no package, and a phone's old package is P0-04's case (E6) |
| A Demo Malls venue and mall detection | AC-24 for the seeded value. Detection is P0-04's, with fixtures |
| Invalid input in the committed sources | AC-1 to AC-4, AC-17 and AC-24 fail on a damaged file |

## 5. Scale targets (spec r2 §7)

- **Mall scale:** Aurora has 401 places and Skyline Spire 16 levels. Demo Malls' totals are AC-2 (FEATURE_PIPELINE P0-02, L102).
- **Per venue and platform (PRD §7):** up to about 100,000 m² per venue, about 20,000 graph nodes and about 5 tenants. The seed adds 2 test tenants and builds no graph.
- **Run time:** no target (C5). The report gives the measured time of one full `npm run seed` and of the `seed-tests` check.

## 6. Records

- **`db/seeds/README.md` → 0.2:**
  - the exports behaviour: the no-exports line, the skip rule and its reasons, Majors in name order (revisited at FF-9), git-ignored, not copied into coder copies (C9);
  - AC-23's stop and its way out;
  - no georeference on Demo Malls (G1);
  - no anchors (C4);
  - `MeasuredPower` at 1 m against −30 dBm transmit power (C6);
  - Spike Venues through FF-SK's switcher;
  - `npm test` and the shared-transaction rule;
  - what FF-2 finished.
- **`db/seeds/sources/spike-exports/README.md`:** git-ignored; a file that cannot be used is skipped with a line; Majors follow name order.
- **`.gitignore`:** one line (C3).
- **Root `README.md`:** the verify check list gains "the seed's tests"; the commands gain `npm run seed:test`.
- **`CLAUDE.md` Commands:** the Parts list gains `seed:test`, and the `verify` line gains the seed tests.
- **`INSTALL.md`:**
  - A.1b: exports are git-ignored and skipped with a line when they cannot be used; the AC-23 stop and its way out;
  - A.4: the check list.
  
  Setup itself does not change.
- **`tools/verify.js` and `.github/workflows/e2e.yml`:** see §3.7.
- **`docs/testing/E2E_Test_Cases_Manual.md`:** a "P0-02 seeded data" phase with rows for AC-12, AC-13, AC-14 and AC-16.
- **`docs/testing/E2E_Frontend_Test_Cases_Manual.md` and `Smoke_Test_Guide.md`:**
  - AC-15: Demo Malls in the list; MEZZ office through the switcher;
  - AC-6: the penthouse, on your machine only;
  - the AC-10 real-emulator check: the Emulator UI lists the six users;
  - two seeds at once;
  - AC-23's way out: after a publish, `npm run seed` stops; then `npm run setup-db` and `npm run publish:dev -- DEMO_MALLS --all`. This row is marked "from FF-3", because the command is FF-3's.
- **The main session, on your go:**
  - `docs/product/FEATURE_PIPELINE.md` P0-02: Intent, Spec r2 and this plan filled; the description corrected for C4 and C6; status IN PROGRESS until FF-3 publishes the seeded venues (C10).
  - Blueprint §4.6: the seed as built (the exports behaviour, the AC-23 stop, no georeference, no anchors).
  - WORKING_AGREEMENT §7's "never in git" list and the `gabay-product-rulings` skill's L123 line gain the exports path (C3).
  - Any `plan.html` work the batch row (L156) does not already cover.
- **Retrofit ledger:** no rows. FF-2 adds no route and no screen. `publish:dev`'s ledger row is FF-3's.

**The sync table walked:**

| Row | FF-2 |
|---|---|
| `db/schema.sql` | Not touched: no schema change (`GeoreferenceJson` and `VenueVersion` exist in 0.14) |
| An API route | None added. FF-0's and FF-1's routes are only exercised |
| A screen or its wording | None. No changelog entry (spec r2 §6 item 11) |
| A dependency | None. `node:test` is built in; `pg` is already pinned in `db/seeds` |
| A setting, limit or option list | No new setting or `.env` key. The seeded lookups are unchanged |
| A command or check | `seed:test` and `seed-tests`: CLAUDE.md, README, INSTALL, `tools/verify.js`, `e2e.yml` |
| An owner ruling | C1–C10, A8, A10 and G1, recorded by the batch (L156). Applied in FEATURE_PIPELINE, Blueprint §4.6, WORKING_AGREEMENT §7 and the skill (C3) |
| A pipeline entry's state | FEATURE_PIPELINE P0-02 stays IN PROGRESS (C10) |
| A deploy or an incident | None (E-20 rule 2) |

## 7. Who and order

1. **api-coder,** in its copy (`Gabay-wt/api-coder`), on a branch from `main` after FF-1 is merged:
   - the §3.1 checks;
   - the failing tests (§4);
   - §3.2, the library split, with every existing line unchanged;
   - §3.4, the AC-23 stop;
   - §3.3, the exports;
   - §3.5, the G1 comment;
   - §3.6, the seed fixes FF-1 needs;
   - §3.7, the check and the three named tests;
   - the §6 records it owns;
   - `npm run verify` (with `GABAY_VERIFY_OWNER=api-coder`), ending ALL GREEN, pasted with the measured seed time.
2. **test-verifier,** in api-coder's copy: the traceability table with results, and any missing test.
3. **dod-reviewer:** the diff against spec P0-02 r2 and this plan, and `REVIEW.md` (the privacy pass covers AC-21's third bullet).
4. **The main session,** on your go: the §6 documents it owns.
5. **You:**
   - AC-6 on your machine (`npm run seed` with the penthouse present: `PENTHOUSE` on Major 1);
   - the AC-15 smoke rows;
   - the pull request.

Sonnet 5.5 does steps 1 and 2 (well-defined coding, WORKING_AGREEMENT §8).

## 8. Risks

- **FF-3: the spike venues cannot be published until FF-10.** Their `NeedsReview` doors keep them unpublishable until FF-10's editor confirms each one (L108, L117); L120 counted 17 across the penthouse and MEZZ office. Until then FF-3 can publish only Demo Malls, unless FF-3's spec rules a development path.
- **AC-23's way out depends on FF-3.** The line names `publish:dev`, which FF-3 builds (DC-P17). No one meets the line before FF-3, since only FF-3 writes versions. A mistyped code fails loudly (P0-03 r2 Q17 (a)).
- **Later slices and the delete list.** The seed deletes only the tables L120 writes, plus `Anchor` and `TransitPoint`. A slice whose screens write other tenant tables (FloorUnderlay, BeaconPlan, Sentinel, Closure) must add them to the list, and extend AC-18's test. Otherwise a re-seed after hand testing rolls back on a foreign key. Versions are AC-23's.
- **AC-2 may not match.** L120's totals come from a recorded run, and the test is new. A difference is reported to you and never re-baselined, and so is any §3.6 fix that would change them.
- **FF-1 may refuse seeded values,** or write the boundary in another JSON form (§3.6). The fixes go in the seed and are listed in the report.
- **Test run time is unmeasured.** Each seeding writes thousands of rows one at a time, and four test files seed once each. If the `seed-tests` check adds noticeably to verify, the measured times go to you before anything changes.
- **RECALLED, unverified:** that the spike's share-sheet export has the same JSON shape as its bundled assets (spec §5). AC-8's and AC-25's fixtures follow `mezz.json`'s shape and are checked against your first real export.
- **The cross-package require** (`functions/test` → `db/seeds/lib`) needs `db/seeds` installed. verify and `e2e.yml` both install it; `lint.yml` runs no API tests.
- **The fake emulator** proves the seed's logic, not the real emulator. The real one stays covered by verify's `seed` check (exit code) and a smoke row, as today.

## 9. Definition of done (FEATURE_PIPELINE §5) for FF-2

| Item | FF-2 |
|---|---|
| 1 Schema and migration | Not applicable: no table changes |
| 2 Seed data | Applies: this entry is the seed |
| 3 Guard order | Not applicable: no route is added. FF-0's and FF-1's routes carry their own waivers |
| 4 Permission and menu rows | Not applicable: no route or menu entry |
| 5 Scaffolds, four states | Not applicable: no list or form |
| 6 Notifications | Not applicable |
| 7 Refresh on return | Not applicable: no screen |
| 8 Dark mode, rule 6 | Not applicable: no Dart code |
| 9 Automated e2e | `Waived: 9 (automated e2e) — R12; the feature's API and frontend manual cases are still written now`. No ledger row: no route or screen is added |
| 10 Manuals and smoke guide | Applies (§6) |
| 11 Changelog | Not applicable: no app surface changes |
| 12 Sync table | Applies (§6) |
| 13 FieldSpec | Not applicable: no form |
| 14 Enumerable sets | Applies narrowly: Demo Malls' own building types stay lookup rows (AC-16). The source-to-code maps are never offered to a client |
| 15 Inactive lookup | Not applicable here: it is P0-01's AC-9, which runs on these rows |
| G1 Traceability | Applies (§4) |
| G2 Tagalog, names, ×1.4 | Not applicable: the console lines are developer output, not ARB |
| G3 Offline shopper | Not applicable. AC-24 only stores no georeference |
| G4 Differences recorded | Every ruling is as recommended and recorded by the batch (L156); nothing further |

## 10. DESIGN CHOICES (each with an alternative)

- **D1. The seed becomes a library (`runSeed`) with a thin command.** *Alternative:* test by spawning `seed.js`. Not taken: a passing child run commits, which L151 forbids.
- **D2. A nesting adapter turns BEGIN, COMMIT and ROLLBACK into savepoints.** *Alternative:* test only `runSeed`. That would leave `main()`'s rollback, stop and exit code to review; it would be better only if the adapter proved brittle.
- **D3. A temporary sources folder.** *Alternative:* write into the real `sources/`. Not taken: it races with other runs, and a crash could leave files behind.
- **D4. A fake Identity Toolkit server, with the host read at call time.** *Alternative:* the real emulator in the tests. Not taken: it needs the shared ports and the lock, and it is slower. It would be better if the fake drifted from the emulator's replies.
- **D5. The seed's tests live in `db/seeds/test/`, under a new `seed-tests` check.** *Alternative:* `functions/test` under `api-tests`, with no new check and no changed tests. Not taken: the seed's tests would sit in the API package.
- **D6. FF-1's API tests seed inside their own rolled-back transaction.** *Alternative:* a check after `seed` that reads the committed seed. It would be faster, but it depends on the check order and fails when run alone.
- **D7. Checks before writing, plus a savepoint per export.** *Alternative:* the checks only, so an unforeseen database refusal rolls back the whole seed.
- **D8. A skipped export keeps its Major slot.** *Alternative:* number the valid files only, which shifts the files after a broken one.
- **D9. On a code clash, the later file by name is skipped.** *Alternative:* skip both. That is stricter but loses a good venue.
- **D10. The no-exports and skip lines are worded as in §3.3.** *Alternative:* your wording.
- **D11. The IMAX check covers every `Name` and `SearchKeywords` column.** *Alternative:* venue and occupant names only.
- **D12. AC-16's tenant rows are OPEN_AIR, ARENA and STATION, from the README.** *Alternative:* derive them from the demo JSON, which re-implements the converter's map.
- **D13. AC-23's check runs first inside the seed's own transaction, raising a `SeedStopped` error that `main()` prints as its own line.** *Alternative:* a separate query before BEGIN, printed with the "rolled back" prefix. Not taken: a version written between that query and BEGIN would be missed, and the prefix would wrongly suggest a failure part-way.
- **D14. AC-23's tests insert `VenueVersion` rows directly** (a `FAILED` row, and a `PUBLISHED` row with its `StoredFile`). *Alternative:* create them through FF-3's publish, which would tie FF-2 to FF-3's merge.

## Suggestions (outside the spec; not built)

- Add `db/seeds` to verify's ESLint and Prettier scope (it has `node --check` only today).
- Extend the seed's delete list to every tenant-scoped table now, ahead of later slices (§8).
- Let `seed:db-only` keep the six accounts (spec §8 leaves it as it is).
- Have `npm run setup-db` clear the local package folder (FF-3's suggestion), so AC-23's way out leaves no orphaned package files.

## Revision history

- **1.0 (2026-10-09):** approved in the FF-1 to FF-4 batch (L156; `plan/FF-1-4-decisions.md`).
  - Cites `spec/P0-02.md` r2 and `spec/P0-01.md` r2.
  - §2 marks every question ruled (C1–C10, A8, A10, G1) and notes `publish:dev`'s unknown-code rule (P0-03 r2 Q17 (a)).
  - New: §3.4, the AC-23 stop; §3.5, AC-24 (G1); and AC-25's six kinds in §3.3.
  - §3.6 checks the seed against P0-01 r2's rules (B2's derived boundary, B6, B7).
  - §4 updated: AC-14 (C8), AC-20 (C7), and AC-23 to AC-25 with their tests; edge cases follow spec r2 §5.
  - §6 adds AC-23's records; §8 replaces the FF-3 re-seed risk with AC-23; D13 and D14 added.
  - The 0.9 questions are removed, ruled as C7 to C10.
- **0.9 DRAFT (2026-10-09):** first draft, for the batch.
