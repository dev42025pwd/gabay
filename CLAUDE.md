# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

Phase 1 was declared on 2026-10-07 (L122). There is still no git repo or product code, only the Phase 0 documents and the test seed. The repository holds `Engineering Standards.html` (the Dynamiq engineering standard, v1.0, owned by Allan Young, deputy Raphael Mendoza), `plan.html` (the decision log), `GABAY_PRD.md`, `GABAY_MASTER_BLUEPRINT.md`, `FEATURE_PIPELINE.md`, `EXCEPTIONS.md`, `db/schema.sql` (PostgreSQL) with `db/SCHEMA_READING_GUIDE.md`, and the §2 stubs (README, INSTALL, `.env.example`, the E2E manuals, `Smoke_Test_Guide.md`, `DEPLOYMENT_RUNBOOK.md`, `INCIDENTS.md`). There is no git repo, `pubspec.yaml`, backend, build, lint, or test command. Do not invent commands. Add them here once they exist.

**Local database (L109, L115):** PostgreSQL 18.6 is installed on the developer's machine (`C:\Program Files\PostgreSQL\18`, port 5432, database `gabay_dev`; the password is in the developer's local `.env`, never committed). Check the schema with `psql -U postgres -h localhost -d gabay_dev -v ON_ERROR_STOP=1 -f db/schema.sql`, run twice; both runs must exit 0. **The test seed (L120)** is the only code so far, built before Phase 1 on the owner's permission for that task alone: `cd db/seeds && npm run seed` (local Auth emulator, project `demo-gabay`). Any other code waits for a plan the product owner has approved.

The standard is a single-page viewer. Its content is Markdown inside `<script type="text/plain" id="src-...">` blocks, rendered by JavaScript, so read the raw file rather than stripping the HTML. Grep for `^#{1,3} ` to find sections. The blocks are `start-here`, `checklist` (the normative standard, §1–§14 plus Appendices A and B), `lifecycle`, `order` (Appendix C, build order), `sdlc`, `audit`, `worksheet`, then `prd`, `blueprint` and `pipeline`.

**The `prd`, `blueprint` and `pipeline` blocks are worked examples for an invented domain (RetailPOS).** Its specifics (BIR receipts, TenantId+BranchId, shifts, stock movements) are not requirements for this project. Gabay's own domain is in `GABAY_PRD.md`, `GABAY_MASTER_BLUEPRINT.md` and `plan.html`.

**Design standard (plan.html L83–L88, L92, L99).**
- **Main reference (L85, L92, L99):** `Gabay Demo.apk`, the `demo_app` release build of 2026-10-06 (SHA-256 74467157…11EED), which replaced Demo Prototype 4. Its source is the Flutter project `C:\Users\User\FlutterProjects\demo_app`; it has no git history, so copy the source to the scratchpad before the owner rebuilds, for the next diff. Everything in it is built in the user-facing app, in tier order.
  - L86–L88, L92 and L99 record where the product follows the demo and where it does not.
  - `flutter test test/screenshot_test.dart --dart-define=SHOTS_OUT=<dir>` in that project renders its 65 screens.
- `3d_navigation_mockup.html` (L83) is the earlier standard and sits behind the demo.
- Both are references, not sources. Never copy code from them (L34), and never build, lint or test them with the product.
- Any gap or conflict not settled by L85–L88, L92 or L99: stop and ask the product owner. Never assume.
  - Settled: routes are ranked by shortest metres (L86); the walkway graph stays generated at publish (L32); escalators follow the real mall (L86).
  - Settled (L92): a route cuts through a store only if the mall marks it, it is open and the shopper allows it. A store that is the only way to a place is always used, worked out at publish. Publish refuses a walkway that crosses a wall.
  - Settled (L99): hedged wording and the "Are you here / at the escalator / arrived" checks only when the position is hand-set, approximate or unsure; a confident live dot gets plain directions and detected arrival (amended by L113, below). Stairs lead only when they beat the no-stairs route by the mall-set threshold (`routing.stairsSaveM`, default 144). The voice goes through Gabay's own platform channel, never `flutter_tts`. QR: none since L107 (the anchor and place codes were removed). Favourites and recents stay on the phone. The wrong-way sound also plays on an L80 deviation. Tagalog is ARB localisation, reviewed by the product owner (L109; OQ12 closed).
  - Settled (L103): Android 7.0+ (`minSdk 24`) and iOS 15+, both at the pilot; phones portrait, tablets get a wide layout and landscape (differs from the demo by ruling). "Nearest" and every distance shown come from one cached whole-graph Dijkstra from the RG3-snapped origin, the demo's method without its straight-line snap.
  - Settled (L104, L105): the admin analytics dashboard is the gabay_spike one (L71), totals only (no individual tracks or per-person views; small groups withheld), opted-in shoppers only, rolled up nightly; forecasts are an in-house seasonal model, shown only once proven. Still behind the L42 legal gate.
  - Settled (L106, L107): the live dot moves and looks as the gabay_spike APK's (jump gate, smoothing, line lock, route snap, glide; values are `dot.*` settings), with the product's freeze (D4b #4), connector-only floor changes plus a 15 s recovery check, a solid halo (dashed ring only for approximate), and the demo-look cone along the walking direction. No QR anywhere: no scanner, no codes, no web directory (P2-01 cancelled); calibration comes from a place the shopper picks after describing it.
  - Settled (L108): at P1 (P1-03), a draft map is generated from plans uploaded per building and level (DXF, IMDF, vector PDF, scans) by rules in the admin's browser: no AI, no OCR. Every generated element starts `NeedsReview` and publish refuses until each is confirmed or edited. Assisted tools are drafted only (P3-04).
  - Settled (L109, L110): shopper sign-in is email, Google and Apple; no weather in forecasts; the forecast limit is 30% WAPE. Off-route is 3 updates beyond 5 m (7 m inside a store); the route never switches on its own; browsing in an off-route store holds guidance; the other ways are named by what differs. The design-notes file is background only: positions stay on the phone, no crowd learning from phones, no barometer.
  - Settled (L111): "Map faces the way I walk" turns the map to the route segment's heading (not the compass) during a route only; off by default, with a rail button and a one-time tip; a clock-timed glide at real turns only (`map.*` settings); touch pauses it until Recentre; the compass button switches it off for this route and returns to the building's own "up" (`MapUpDeg`).
  - Settled (L114–L117): positioning is in-house (D4c), the live dot is P0 with the fallback (D4d), D8 (who owns the beacons) is held until after the app is built, D9 is static iBeacon with a range per floor. The lead's approvals are exercised by the product owner under delegation from Raphael Mendoza (L115). The product owner is Gabay's DPO; voice search asks before audio leaves the phone; `analytics.minGroupN` = 5; counsel reviews before analytics ships (L116). Evacuation is P3 and the emergency button is hidden until then; the coder-model trial runs on P0-01; spike-measured numbers start as provisional settings (L117).
  - Settled (L119): the first test venues are local only: tenant "Demo Malls" (the demo's Aurora, Bayview Grand, Meridian Twin Malls, Skyline Spire; no beacons) and tenant "Spike Venues" (penthouse, internal only; MEZZ office; the owner's exported spike venues). Converted from JSON only (a one-off dump of the demo's generator in a scratch copy; the spike's exports), stored per the schema, published by our engine, walkways generated then edited. Six `@gabay.test` accounts, one per role; passwords in `.env` (`SEED_PW_*`).
  - Settled (L118): a guided walk is the P0 fallback for BLE trouble (P0-15): started by hand from the route sheet, a timed dot at the shopper's pace that waits at every turn and landmark for a confirmation; a one-time tip and a hint when the dot fails; off-route off and nothing recorded while guided. "Preview the route" plays a ghost dot for shoppers. The demo panel stays internal (L85).
  - Settled (L123): app ID `com.dynamiqes.gabay`; theme seed `#C1623D` terracotta until the brand colour is known, then a "Gabay" or "Terracotta" setting (P0-14); Node 22 via fnm from `.nvmrc` (L124; in Git Bash use `fnm exec --using=22 -- <cmd>`, and `npm.cmd` not `npm`); the APK and `db/seeds/sources/internal/` never in git; Phase 1 runs on `plan/PH1-rails.md`.
  - Settled (L112, L113): voice cues at fixed metres ("Coming up" 20 m, "now" 5 m; `voice.*` settings); tap the card to repeat; other audio ducked; foreground only; with a screen reader on, it is the only voice; a missing Filipino voice is offered for install, English meanwhile; everyday Taglish and an optional `SpokenName`; the emergency always speaks; checks by tap only. Places are always worded suggestively and actions plainly; every ride ends with "Are you on ⟨level⟩?" whatever the dot; left and right as you walk; "Am I on the right path?" is P1-06. The platform audio and accessibility calls were checked against the docs (OQ21 closed by L117); iOS Reduce Motion is `AccessibilityFeatures.reduceMotion`, not `disableAnimations`.
- Never copy the demo's known bugs (L85).

## What comes first (Appendix C.1)

"Enforcers before the code they govern; rails before the traffic." Phase gates are conditions, not dates.

- **Phase 0, before any code:** write `<SYSTEM>_PRD.md`, `<SYSTEM>_MASTER_BLUEPRINT.md` Parts 1–3 (including `schema.sql`) and `FEATURE_PIPELINE.md` using the Appendix B templates. Pin the versions actually chosen, and the choice of `provider` or `riverpod`, in Blueprint Part 1.
- **Phase 1:** set up the rails and guardrails: git hooks in `.githooks/` (the README must document `git config core.hooksPath .githooks`), CI, structural linters including the schema-to-form drift linter, and one verification command that exits non-zero on failure.
  - Everything deploys to Firebase/Google Cloud in Singapore (L93, L98): the admin web page on Firebase Hosting (E-05); the API as one Cloud Function with `maxInstances = 1`; Cloud SQL for PostgreSQL through Firebase SQL Connect; files in Cloud Storage; Firebase Auth. A preview per PR, and a live deploy after merge only with a named release approval. **Local first (L109):** until the product owner calls the first deploy, everything runs on the developer's machine (Firebase Emulator Suite, local PostgreSQL), with no cloud previews; every Firebase deploy happens only on the product owner's call. **The P0 gate is met and Phase 1 is declared (L122, 2026-10-07).** The §1 sign-off item (E-02 to E-04, E-06 to E-10, E-12 to E-14) was settled by L115. The product owner, Genesis Perez, read and signed `db/schema.sql` at draft 0.14 with no changes (L122). In Phase 1, rewrite this file to under a page (§8.4): commands, the verification block, the companion-file sync table (§8.5), and the traps this repo's agents actually hit.
- Changes flow as `intent/<id>-<slug>.md` → `spec/<id>.md` → `plan/<id>.md` → diff → PR. Each artifact is named by its pipeline ID.

## Mandated stack (checklist §1)

- **Frontend:** Flutter Web (plus Flutter mobile only if a field app is needed). Use `provider` or `riverpod`, one per project, in the MVVM layering View → ViewModel → stateless Service. Use `dio` through a single `ApiClient`, and `go_router` with `usePathUrlStrategy()`.
- **Backend:** Node.js + Express, and MSSQL via `mssql` with raw parameterized SQL. Use `decimal.js` for money, `jsonwebtoken` + `bcryptjs` (cost 10) for auth, and `helmet`, `cors`, `express-rate-limit` and `multer`.
- **Denied:** React, Vue, Angular, Python or PHP backends, PostgreSQL, MySQL, MongoDB, any ORM, floating-point money, and `moment`. A deviation needs written lead sign-off and an `EXCEPTIONS.md` entry with an expiry date.
- **Versions:** use the current LTS or stable release at project start, never one copied from another repo.
- **Gabay's deviations (plan.html L98, 2026-10-06; EXCEPTIONS E-02 to E-14):** the product owner moved the whole backend to Firebase. PostgreSQL (Cloud SQL via Firebase SQL Connect, Singapore) in place of MSSQL, reached with `pg` and raw parameterized SQL (no ORM, as before); the API as one Cloud Function for Firebase (Node 22, the Functions runtime), Express inside; Firebase Auth in place of `jsonwebtoken` + `bcryptjs`, with roles and permissions still in the database; `firebase-admin` and `firebase-functions`. `db/schema.sql` is PostgreSQL; `db/schema.mssql.sql` is the superseded T-SQL. The shopper app adds two packages §1 does not name (L99, E-10 and E-12): `speech_to_text` and `audioplayers` (`mobile_scanner`, E-11, was withdrawn by L107). The admin web page adds `pdfjs-dist` and `@techstark/opencv-js` for plan import (L109, E-13, E-14). **All of these, and E-02 to E-04, are approved with expiry 2027-04-02 by the product owner under delegation from Raphael Mendoza (L115), which settles the P0 gate's §1 item.** Never introduce Firestore or the Realtime Database: L98 chose one relational database.

## Rules that apply from the first line of code

1. Money is `decimal.js` in code and `DECIMAL(18,4)` in the database. Never use a float at any layer.
2. Every tenant-scoped query carries its tenant predicate. Take it from the request context (`req.tenantCompanyID`), never from the JWT user object.
3. Never interpolate a value derived from the request into SQL. Sort keys, filters and lookup names go through an allow-list map.
4. A committed migration is never edited. Write a new migration with a zero-padded number, and reflect the change in `schema.sql`, where every `CREATE TABLE` needs a matching `DROP TABLE`.
5. Never hardcode an option list. If a client could ever ask to add a value, it becomes a table with a maintenance screen served through `/api/lookups/:name`.
6. Color literals live only in the theme-token file. Never use `ThemeData.primaryColor` or `Colors.black`/`grey`/`white`; use `Theme.of(context).colorScheme.*`.
7. Forms are projections of the schema. Use one `FieldSpec` per field, never a bare `TextFormField` in a view (§4.10, Appendix A.13).

## Evidence Standard for Greenfield Planning (no existing codebase)

NOTE: The engineering standards takes precedence if any of there bypasses or overrides the regulations indicated in that

With no code to check claims against, ground recommendations in these
instead:

1. TRACE TO A STATED REQUIREMENT: Every design decision must trace back
   to something actually specified (a stated requirement, constraint,
   or explicit answer given earlier) — not an invented one. When a
   decision fills a gap the requirements didn't cover, label it
   explicitly as a DESIGN CHOICE (not a requirement) and name at least
   one alternative that would also satisfy what was actually stated.

2. GROUND EXTERNAL CLAIMS IN DOCS: Any claim about what a library,
   framework, service, or API can do — including "this is the standard
   way to do X" — must be backed by a doc fetch or source check done
   this session. Tag it RECALLED if it hasn't been checked, and re-verify
   before it's load-bearing in the plan.

3. FLAG UNKNOWNS, DON'T FILL THEM SILENTLY: Anything the plan needs but
   hasn't been specified (scale, budget, team size, deployment target,
   compliance needs, etc.) must be listed as an OPEN QUESTION, not
   assumed and folded into the design as if settled.

4. NAME THE ALTERNATIVES: For any nontrivial decision, state at least
   one other viable approach, why it was passed over, and under what
   conditions it would have been the better choice instead.

If a recommendation can't be traced to a stated requirement, a checked
doc, or a flagged assumption, treat it as unsupported and say so rather
than presenting it as settled.

## Before reporting work complete

Run the verification command and paste its output. If a test fails, fix the code, not the test. A feature is done only when every item in the §9 definition of done is satisfied or waived in one line.

**How we work (L121): read these before any work; they carry what this file only points to.**
- `WORKING_AGREEMENT.md`: ask, never assume (anything the spec or plan doesn't settle is asked; internal choices are listed as DESIGN CHOICES); approvals (the product owner approves the spec, the plan and the PR; the author never approves its own work); cadence (per feature, phase gates with a signed gate report, no sprints); evidence (pasted output with exit codes, test-rendered screenshots for screen changes, a traceability table); test rules (fix code not tests, flaky = failure, regression tests name the bug, no coverage percentage); hooks; the repository. **New rulings about how we work are recorded there in the same turn.**
- `FEATURE_PIPELINE.md` §5: the definition of done (the standard's 15 items with enforcers, plus G1–G4).
- `REVIEW.md`: the review passes dod-reviewer runs.
- Verification block (Phase 1): `npm run verify` at the repo root runs every linter, the schema twice, the seed, `flutter analyze` and all tests, and ends `ALL GREEN`; exit code = failures. Until it exists, paste each check's own output.

## Rules every product agent carries (L61, L64)

Subagents load this file. These rules apply to every agent in `.claude/agents/`. Keep this section when CLAUDE.md is rewritten at Phase 1.

- **Phase 1 gate:** agents are dormant until Phase 1. Phase 1 starts when the Phase 0 gate is met
  (GABAY_PRD.md, GABAY_MASTER_BLUEPRINT.md Parts 1–3 with db/schema.sql, FEATURE_PIPELINE.md) and
  the product owner has declared it, recorded as a line `Phase 1 declared <date> (L-row)` in this
  file. If that line is absent, stop and ask.

  Phase 1 declared 2026-10-07 (L122)

  The declaration wakes the agents. It approves no work: each Phase 1 task, the rails included,
  still needs the product owner's approved plan, and every repository, push or deploy waits for
  their call.
- **Models (L62, L122; WORKING_AGREEMENT §8):** Sonnet 5.5 for well-defined coding. Opus 5.5 or
  Fable 5.1, by weight, for in-depth analysis and decisions. Every important scenario goes to the
  product owner first, including any move to Opus or Fable.
- **Pipeline:** intent → spec (spec-writer) → plan (the main session writes it, the product owner
  approves it, and it cites the spec revision) → diff (coders) → tests (test-verifier) → review
  (dod-reviewer) → the product owner's sign-off.
- **Evidence:** paste command output; never write "should work". Tag an unchecked library, framework
  or API claim RECALLED. If a RECALLED claim is load-bearing, verify it first (doc fetch or source
  check) and cite it; if you cannot, stop and ask.
- **Scope:** build only what the spec and plan say. Put anything else under `## Suggestions`.
- **Spec vs plan:** if they disagree, stop and ask, quoting both passages.
- **Spec revision:** `plan/<id>.md` names the spec revision it was built from. Work against that
  revision. If `spec/<id>.md` has moved on since, stop and ask.
- **Edge cases:** every edge case in the spec gets a test or a one-line reason why not.
- **Ambiguity:** never guess. Subagents cannot call AskUserQuestion, so stop and return
  `## Questions for the user`, each question tagged `[<agent-name>]`, with 2–3 options and the
  recommended one first. The main session asks the product owner and resumes you.
- **Code quality:** clean, readable, maintainable, and scalable to the scale targets the spec states
  (cite them). Extract on the second use, except parts the standard or Blueprint mandates (C2).
  Clear names, one responsibility per file.
- **Dependencies:** versions come from the Blueprint Part 1 pins, never from another repo (including
  gabay_spike). A new dependency needs a Blueprint pin and, if it is outside §1, an `EXCEPTIONS.md`
  entry (C8). Limits are named constants, env values or settings (C8).
- **Tests:** an existing test changes only when `plan/<id>.md` names the test and the spec change
  behind it (C1). List every test you changed, with a one-line reason.
- **Done:** every §9 item is met or waived in one line. dod-reviewer's check is an AI self-check; the
  product owner signs off.
