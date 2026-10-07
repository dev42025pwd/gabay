# Gabay

> **Version**: 0.1 stub | **Date**: 2026-10-07 | **Status**: Phase 0 stub (standard §2; plan.html L115) | **Audience**: anyone cloning the repo | **Scope**: stack, layout, doc index, first-time setup, commands

Gabay is an indoor wayfinding app for shopping malls in the Philippines: a shopper app (Android and iOS) that finds stores and guides people across floors, and an admin web page where mall staff draw and publish their maps. See `GABAY_PRD.md` §1 for the product, and `plan.html` for every decision (L1–L117).

## State

**Phase 1 was declared on 2026-10-07 (L122), after the product owner signed the schema read.** There is no git repository, product code or build yet; the Phase 1 rails come first, each on an approved plan.

## One-time setup after cloning (do this first)

```sh
git config core.hooksPath .githooks
```

Without this the pre-commit and pre-push hooks never run (standard §2, §8.1). The `.githooks/` folder is created in Phase 1.

## Stack (Blueprint Part 1 holds the pins)

- **Shopper app and admin web page:** Flutter 3.47 (one project, `main_mobile.dart` and `main_admin.dart`), riverpod, go_router, dio. Android 7.0+ and iOS 15+ (L103).
- **API:** Node.js 22 + Express inside one Cloud Function for Firebase (L98).
- **Database:** PostgreSQL (Cloud SQL through Firebase SQL Connect, Singapore), raw parameterized SQL through `pg`, no ORM. PostgreSQL 18 locally (L115).
- **Sign-in:** Firebase Auth. **Files:** Cloud Storage for Firebase. **Admin hosting:** Firebase Hosting.
- **On the phone:** each mall's published map is a read-only SQLite package (FTS5, R*Tree, a CSR walkway graph); routing and positioning run on the phone; positions never leave it (invariant 4).
- Deviations from the Dynamiq standard §1 are in `EXCEPTIONS.md` (E-02 to E-14, signed L115).

**Local first (L109):** everything runs on the developer's machine (Firebase Emulator Suite and a local PostgreSQL). Nothing is deployed to Firebase, and no store build is published, until the product owner calls it.

## Repository layout (Blueprint §2.3; created in Phase 1)

| Path | What |
|---|---|
| `api/` | Express app, routes, services, engines (publish, graph, planner, live status) |
| `db/` | `schema.sql` (the target schema), migrations (Phase 1), `SCHEMA_READING_GUIDE.md` |
| `lib/` | Flutter: `core/` (positioning, routing, package, map3d, voice), `features/` (shopper, editor, admin) |
| `.githooks/` | pre-commit and pre-push hooks (Phase 1) |
| `.claude/agents/` | the build agents, dormant until Phase 1 (L64) |

## Documents

| Document | Answers |
|---|---|
| `GABAY_PRD.md` | Why, and what each feature must do |
| `GABAY_MASTER_BLUEPRINT.md` | How: stack pins, architecture, schema intent, module anchors |
| `FEATURE_PIPELINE.md` | What is built, in what order, and its status |
| `plan.html` | Every decision, with evidence (decision log L1–L117) |
| `EXCEPTIONS.md` | Signed deviations from the standard, with expiry dates |
| `db/schema.sql` | The PostgreSQL schema (56 tables) |
| `INSTALL.md` | Bringing up a development machine |
| `DEPLOYMENT_RUNBOOK.md` | Deploying to Firebase, on the product owner's call |
| `E2E_Test_Cases_Manual.md`, `E2E_Frontend_Test_Cases_Manual.md` | Release-gate manuals (Phase 1+) |
| `Smoke_Test_Guide.md` | The whole-system smoke pass (Phase 1+) |
| `INCIDENTS.md` | Incidents, newest first |
| `CLAUDE.md` | The contract for AI agents working here |
| `Engineering Standards.html` | The Dynamiq standard v1.0 |

## Commands

Run, test and the single verification command are added here in Phase 1 (standard §8.4). Until then:

```sh
psql -U postgres -h localhost -d gabay_dev -v ON_ERROR_STOP=1 -f db/schema.sql   # the schema (run twice; both exit 0)
cd db/seeds && npm install && npm run seed                                       # the local test seed (L119, L120)
```

## What does not exist (by decision)

- No QR codes anywhere (L107). No web directory (P2-01 cancelled).
- No background location or background BLE scanning (invariant 5).
- No server-side positions or crowd learning from phones (invariant 4, L110).
- No Firestore or Realtime Database (L98).
