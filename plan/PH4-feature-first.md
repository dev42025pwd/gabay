# PH4-feature-first — The P0 features first, then Phases 2 and 3 (E-20)

> **Version**: 1.0 | **Date**: 2026-10-09 | **Status**: APPROVED by Genesis Perez, 2026-10-09 (L153), with §9's five questions ruled, all as recommended. Each slice still needs its own approved intent, spec and plan before it is built | **Audience**: the product owner, the main session, every coder | **Scope**: the order Gabay's P0 features are built in while exception E-20 is in force, what each slice lets you run, and how Phases 2 and 3 are fitted afterwards (the retrofit)
>
> **Traces to:** the product owner's ruling of 2026-10-09, option (b) "everything first": "I want to see and use the features on localhost first, and the security, tenancy, audit and deployment work follows after", with the hard rules: localhost only (L109), no deploy, throwaway test data only and never kept, nothing goes live until the retrofit is done.
> **Deviates from:** standard Appendix C.1, which puts Phases 2 and 3 before Phase 4. Recorded as EXCEPTIONS E-20 (L153).
> **Spec:** none for this plan. It orders work. Each P0 entry still gets its own intent, spec (spec-writer) and plan, approved by you before it is built (WORKING_AGREEMENT; FEATURE_PIPELINE §5).

## 1. What changes and what does not

**Changes:**
- The P0 features are built before Phase 2's remaining slices and before the rest of Phase 3.
- The admin side runs on a development stub instead of real sign-in, tenant context and permission checks (§3).
- Three definition-of-done items are waived per feature, each in one line, until the retrofit: item 3 (guard order), item 4 (permission and menu rows) and item 9 (automated e2e) (§5).

**Unchanged, in force from the first feature:**
- The seven rules and every linter, including `tenant-predicate`: tenant-scoped queries still bind `req.tenantCompanyID`, which the stub fills.
- Every other definition-of-done item: tests, the four list states, ARB wording, changelog, screenshots, manuals, the sync table.
- The pipeline: intent → spec → plan → coder → tests → dod-reviewer → your sign-off.
- Pull requests with the lint and e2e checks.
- Your go before every action.
- Local first (L109).

**Hard rules for the whole period (E-20):**
1. Localhost only. Everything runs on this machine: the local PostgreSQL, the Firebase emulators, and the app on an emulator or your phone connected to this machine.
2. No deploy of any kind: no Firebase project, no Hosting, no Function, no preview channel.
3. Throwaway test data only: the seeds (Demo Malls, the penthouse, the six test accounts) and whatever you create by hand while testing. Nothing is exported or kept. The retrofit ends by recreating every database from scratch (R13).
4. Nothing goes live, and no real mall's data is entered, until the retrofit gate passes and the exception closes.
5. The stub refuses to load outside `NODE_ENV=development` or `test`, the same guard S1 uses for the Auth emulator (L151).

## 2. What happens to the work in flight

| Item | What happens | Why |
|---|---|---|
| Hook fix, PR #10 (L152) | Merged 2026-10-09, first | Needed for safe pushes from the working copies |
| P2-S1 Authentication | Merged 2026-10-09 (PR #11), after the hook fix | Done and reviewed; the retrofit's R1 builds on it |
| P2-S9 Form and list machinery | Merged 2026-10-09 (PR #12), after S1 | P0-01's forms are built on it (`FieldSpec`, the fk picker, the list scaffold) |
| CI follow-up (L149) | Continues: in progress in api-coder's copy since S1 merged | Unrelated to the order |
| P2-S2 to P2-S8, P2-S10 to P2-S13 | **Paused** until the retrofit (§6), where each is applied to every route and screen the features built | Your ruling: security, tenancy and audit follow the features |
| Phase 3, the rest | **Paused** until the retrofit, except a read-only lookups route pulled forward (FF-0) | Rule 5 needs option lists from tables |
| P0-10 Shopper accounts | **Moved to the retrofit** (R10) | It is identity work, and needs E-19 (the client Firebase packages, L149 Q10) |

## 3. FF-0: the stub and the lookups (before any feature)

**api-coder.**

- **The server stub** (DESIGN CHOICE; the alternative is no request context at all, which would make every route's tenant binding a retrofit edit).
  - A development-only middleware, `functions/src/middleware/devStub.js`.
  - It fills exactly the fields the real chain fills, so the retrofit swaps it out instead of editing every route: `req.user`, `req.tenantCompanyID` (the Demo Malls tenant, or the one named in an `X-Tenant-Id` header between the two seeded tenants), and the actor context (A.1).
  - It is refused at load unless `NODE_ENV` is explicitly `development` or `test`. A test covers unset, empty, production, development and test.
  - The admin routes are mounted behind it. S1's real `auth` stays mounted for `/api/me`.
- **The read-only lookups route** (pulled from Phase 3 §3.19; DESIGN CHOICE; the alternative is hardcoded lists, which breaks rule 5 and would need its own exception).
  - `GET /api/lookups/:name`, with an allow-list map and the global-lookup trap (`TenantId = $t OR TenantId IS NULL`), paged.
  - It reads the seeded tables `BuildingType`, `AmenityType` and `TransitType`, and the others as features need them.
  - There is no maintenance screen: the options come from the seed until Phase 3's screen.
- **The admin client.** No sign-in screen until R8. The admin page opens straight on its menu, showing every entry. A visible "Development build: no sign-in" banner (ARB) makes the state obvious in every screenshot.
- **You can test:** nothing visible yet. On localhost the API answers `/api/lookups/building-types` with the seeded rows.

## 4. The feature slices, in pipeline-map order (FEATURE_PIPELINE §4)

Each slice runs the full pipeline in the coder's working copy and goes to you as its own pull request. "Coder" means the coder for that part; the main session writes the plan.

| Slice | Pipeline entries (map step) | Coders | What you can run and see after it (localhost) |
|---|---|---|---|
| FF-1 | **P0-01** Venue, building and level setup (1) | api-coder (routes, service), flutter-coder (admin screens) | In the admin page in your browser: create a venue, its buildings and levels with real dimensions; lists with search and "Load more"; pick a building type from the seeded list |
| FF-2 | **P0-02** Test venue seeds, finished (2) | api-coder | Demo Malls' four malls and the penthouse appear in the admin lists. Your spike exports when you provide them (L120) |
| FF-S2 | **Spike 2** (the D7 measurement spike, throwaway; not a product slice) | engine-coder | A measurement report: package size, graph load and A* timing on a low-end Android phone. It sets P0-03's format choices and P0-06's latency target (Blueprint OQ6, L117) |
| FF-3 | **P0-03** Publish engine with graph generation (3) | engine-coder (engine, package), flutter-coder (the publish screen) | Press Publish on a seeded venue: a validated package, or the list of problems shown on the map (walls crossed, orphans, unpaired connectors) |
| FF-4 | **P0-04** Shopper shell and package delivery · **P0-06** Routing engine (4) | flutter-coder (shell, 2.5D map), engine-coder (A*) | **The shopper app** on an Android emulator or your phone on this machine: pick a mall, the 2.5D map with levels; tap a store for the shortest route and one other way |
| FF-5 | **P0-05** Directory and search · **P0-07** Step-free routing (5) | flutter-coder (search UI), engine-coder (FTS5 use, the step-free filter) | Search stores and amenities ("comfort room"), "Nearest CR"; the wheelchair route, and "no step-free route" when there is none |
| FF-6 | **P0-08** Location fallback (6) | flutter-coder | "Where are you?": pick a shop, entrance or lift, or describe where you are; an active route recalculates |
| FF-7 | **P0-14** Voice guidance, language and accessibility (7) | flutter-coder; native-ble for the platform voice channel (L99) | Spoken cues at 20 m and 5 m, English or Filipino; a screen reader; large text |
| FF-8 | **P0-09** Venue boundary · **P0-15** Guided walk and route preview (8) | flutter-coder, engine-coder (the guided walk's position source) | The out-of-venue state; a guided walk that waits at each turn; "Preview the route" |
| FF-9 | **P0-13** Live position engine (9) | engine-coder (matching), native-ble (BLE scanning) | The live dot in the penthouse with its five beacons (your phone, on site) |
| FF-10 | **P0-11** Map editor (10) | flutter-coder (editor), api-coder (editor routes) | In the admin page: draw units, doors and connectors, publish, and see the change on the phone |
| FF-11 | **P0-12** BLE placement planner (11) | engine-coder (planner), flutter-coder (screens) | Three beacon plans per floor with counts, cost and coverage heat-maps |

**Not in this plan:** P0-10 (moved to R10) and every P1 to P3 entry.

**Capacity note.** flutter-coder is in 10 of the 12 slices, so it sets the pace. Slices on different coders can overlap where the map allows. Example: FF-S2 (engine-coder) runs beside FF-1, and the engine half of FF-4 beside the shell half.

## 5. Definition of done during the period

Every FEATURE_PIPELINE §5 item applies from the first feature, except three, each waived in the feature's report in one line:

- `Waived: 3 (guard order) — the dev stub stands in; fitted in R1–R3, checked by the route-guard-order lint (R7)`
- `Waived: 4 (permission and menu rows) — added for every route in R2`
- `Waived: 9 (automated e2e) — R12; the feature's API and frontend manual cases are still written now`

dod-reviewer checks that each waiver names its retrofit slice. The retrofit ledger (§7) lists every waived item by route, and R13 fails while any row is open.

## 6. The retrofit (after FF-11, or earlier on your call)

The paused Phase 2 slices, now applied to every route and screen the features built, then the rest of Phase 3.

| Slice | Was | Applies to |
|---|---|---|
| R1 | P2-S2 Tenant context | Replaces the stub on every admin route; `X-Tenant-Id` checked against `UserRole` |
| R2 | P2-S3 Authorization | Role and permission guards on every route; a permission row and menu row for each, in the seed |
| R3 | P2-S4 Audit and redaction | Every mutation the features built, the publish included |
| R4 | P2-S5 Rate limiting | Global and auth limiters |
| R5 | P2-S6 Validation | zod on every feature route boundary; the escalation guards |
| R6 | P2-S7 The admin API | Users, roles, grants, overrides |
| R7 | P2-S8 Two lints | `route-guard-order` and `raw-error-text`, run over every feature route; their findings are R1–R5's checklist |
| R8 | P2-S10 Client session and routing | Sign-in replaces the banner; the menu follows permissions; E-19 requested here (L149 Q10) |
| R9 | P2-S11 Maintenance screens | Users, role grants, overrides, venue grants, the audit viewer, settings |
| R10 | P0-10 Shopper accounts | Sign-in, sign-up and deletion (E-19's shopper parts) |
| R11 | Phase 3, the rest | The lookups controller with tenant scoping and its maintenance screen; cascading pickers and the rest of `FieldSpec`; the feature forms moved onto them |
| R12 | P2-S12 End-to-end | e2e for auth, RBAC and tenant isolation across every feature route, plus each feature's own waived e2e |
| R13 | P2-S13 The gates | Every database recreated from scratch (no row from the period survives). The §6 security gate and the §5 baseline in full, on the system with its features (`phase-reports/phase-2.md`, `phase-3.md`), which you sign. E-20 closes |

## 7. The retrofit ledger

A table in this plan, one row per feature route and admin screen, with columns for the stub-to-real tenant context, guard order, permission row, menu row, audit, validation and e2e. Each feature slice adds its rows; each R slice ticks them. It is the evidence for R13.

Columns: the tenant context (stub to real), the guard order (item 3), the permission row (item 4), the menu row (item 4), the audit row, validation, and the e2e (item 9). `n/a` says why in a word; `open` is an item an R slice still has to close, named in the last column.

| Route or screen | Added by | Tenant context | Guard order | Permission row | Menu row | Audit | Validation | e2e | Closed by |
|---|---|---|---|---|---|---|---|---|---|
| Screen: the admin "Development build: no sign-in" banner (`DevStubBannerFrame`, every admin page) | FF-0 (client) | n/a: a screen; the client sends no `X-Tenant-Id` until R8's switcher | n/a: no route | n/a: no route | n/a: no menu exists yet (R8 builds it from permissions) | n/a: no write | n/a: no input | open: automated e2e waived (item 9); manual cases `FF0-FE-01` to `FF0-FE-05` written now | R8 deletes the banner with its provider, its config and its ARB string, and its manual rows (sign-in replaces it); R12 for e2e |

## 8. Risks

- **Rework.** HIGH by the standard's own account: Appendix C, "retrofitting any of them touches every route that exists at the time". The stub's real-shaped request fields and the ledger reduce it but do not remove it. Unmeasured.
- **The audit gap.** Every admin write during the period has no audit row. The data is throwaway and R13 recreates the databases, so no real record is lost; the risk is a route missed in R3, which R7's lint and R12's e2e are there to catch.
- **Forms built before Phase 3** use S9's minimal machinery and move onto Phase 3's in R11. The standard expects that migration to be the part that gets skipped ("invisible to the customer, so it never gets scheduled"); R13 does not pass without it.
- **The finish date.** UNKNOWN: there are no dates or measured pace (Appendix C ends phases on conditions). The first screens come earlier; the total is likely later than the current order, by the retrofit's size.
- **The stub reaching a deploy.** It is held by its `NODE_ENV` guard, E-20's no-deploy rule, and R1's removal of it, tested.

## 9. Rulings on the open questions (2026-10-09, the product owner, each as recommended)

1. **The stub fills the real request fields** (`req.user`, `req.tenantCompanyID`, the actor). Not taken: no request context.
2. **The read-only lookups route is pulled into FF-0.** Not taken: hardcoded lists under a second exception.
3. **P0-10 is built in the retrofit (R10).** Not taken: map order, with S10 and E-19 pulled forward.
4. **The retrofit starts after FF-11.** Not taken: after FF-4; at a later call.
5. **E-20 expires at the first of three** (ruled as recommended): R13's gates signed; the product owner's call of the first deploy; or 2027-04-02, the quarterly sweep date the other entries use, where it is renewed or closed. Not taken: the retrofit alone, with no calendar backstop; the first deploy alone.
