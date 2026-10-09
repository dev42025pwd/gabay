# FF-SK-dashboards — Every role's dashboard, with placeholders (E-20)

> **Version**: 1.0 | **Date**: 2026-10-09 | **Status**: APPROVED by Genesis Perez, 2026-10-09: pre-approved within their bounds, with §9's three questions ruled, all as recommended | **Pipeline entry**: P0-16, new (PRD §6.26, new) | **Parent**: `plan/PH4-feature-first.md` 1.0 (L153, E-20), under the fast lane (L156) | **Reverses**: L154 ruling 2, for development only | **Approver**: Genesis Perez, product owner

## 1. What the product owner asked for (their bounds)

- Every role gets its full dashboard now: SUPERADMIN, MALL_ADMIN, VENUE_EDITOR and VIEWER on the admin page, and the shopper in the app. Each menu holds every module that role will have: the L41 role matrix and the pipeline's P0 to P3, plus Phase 2's users, roles, permissions, audit log and settings.
- Modules already built work. Every other module opens a placeholder: "Under development", with its name, its pipeline ID and the slice that delivers it. There is no fake data. Analytics and forecasts are placeholders only, because the L42 gate holds.
- Each placeholder is replaced when its slice merges.
- A development role switcher on the admin page; the stand-in acts as the chosen seeded account. It is removed in R8. Every new route and screen gets a retrofit-ledger row.
- The shopper app gets its shell with placeholder tabs now, and FF-4's spec is revised to build on it.
- New entries: PRD §6.26 and FEATURE_PIPELINE P0-16, and one plan.html row for the slice.

## 2. The module registry (one source for menus and placeholders)

`app/lib/core/modules/module_registry.dart` holds one entry per module:
- an id;
- an ARB name;
- its icon;
- its pipeline ID;
- the slice that delivers it;
- the roles that get it;
- whether it is built.

Menus and placeholder pages are drawn from it, so a slice that delivers a module flips one flag and supplies its route.

- **Ruled (ruling 2):** the role-to-module map lives in the app, taken from the L41 table below. R8 replaces it with the permission-driven menu Phase 2 ruled (Q9: the menu from `PermissionRoute`).
- **Alternative:** seed `PermissionRoute` and `RolePermission` now and serve them from the stand-in. That pulls part of S3 and S7 forward.

**Admin modules**, from the L41 access table (modules page, "Who can use what"), the pipeline and Phase 2. ✓ means the role gets it. SUPERADMIN gets every module, because it skips permission checks (Phase 2 Q8).

| Module | Pipeline | Delivered by | MALL_ADMIN | VENUE_EDITOR | VIEWER (read-only; ruling 1) |
|---|---|---|---|---|---|
| Venues, buildings and levels | P0-01 | FF-1 | ✓ | ✓ buildings and levels (P0-01 spec Q9) | ✓ read-only |
| Map editor | P0-11 | FF-10 | ✓ | ✓ | ✓ read-only |
| Publish | P0-03 | FF-3 | ✓ | — (cannot publish, L41) | ✓ read-only |
| Beacon planner | P0-12 | FF-11 | ✓ | — | ✓ read-only |
| Beacons and sentinels (fleet) | P0-13 | FF-9 | ✓ | — | ✓ read-only |
| Plan import and drafts | P1-03 | after the retrofit (P1) | ✓ | confirm or fix only | ✓ read-only |
| Store status and closures | P1-01 | after the retrofit (P1) | ✓ | — | ✓ read-only |
| Analytics (totals only; L42 gate) | P1-04 | after the retrofit (P1) | ✓ | — | ✓ read-only |
| Opening hours and door rules | P2-02 | P2 | ✓ | — | ✓ read-only |
| Store pages | P2-03 | P2 | ✓ | — | ✓ read-only |
| Forecasts, mall events, footfall | P2-04 | P2 | ✓ | — | ✓ read-only |
| Holidays | P2-04 | P2 | ✓ local days | — | ✓ read-only |
| Promos and push | P3-01 | P3 | ✓ | — | ✓ read-only |
| Evacuation plans | P3-02 | P3 | ✓ | — | ✓ read-only |
| Crowd-aware routing | P3-03 | P3 | ✓ | — | ✓ read-only |
| Assisted drawing tools | P3-04 | P3 | ✓ | ✓ | ✓ read-only |
| Users | Phase 2 S7, S11 | retrofit R6, R9 | ✓ | — | — |
| Roles and permissions | Phase 2 S3, S11 | retrofit R2, R9 | ✓ | — | — |
| Audit log | Phase 2 S4, S11 | retrofit R3, R9 | ✓ | — | — |
| Settings | Phase 2 S11 | retrofit R9 | ✓ | — | — |
| Tenants, beacon namespaces, platform lookups | baseline (Phase 3) | retrofit R11 | SUPERADMIN only | — | — |
| National holidays | P2-04 | P2 | SUPERADMIN only | — | — |

**Not in it:** MERCHANT, UNIT and MAINTENANCE are next release (L41), so they get no dashboard now.

**Shopper tabs,** following the Gabay Demo app (L85: Places, Map, Parking, Me). The demo's "Test tools" tab stays internal (L85, L118).

| Tab | Module | Pipeline | Delivered by |
|---|---|---|---|
| Map | Shell, map and routes | P0-04, P0-06 | FF-4 |
| Places | Directory and search | P0-05 | FF-5 |
| Parking | Parking and find my car | P1-02 | after the retrofit (P1) |
| Me | Settings, language and voice; sign-in | P0-14; P0-10 | FF-7; retrofit R10 |

## 3. The placeholder page

One shared screen. It shows "Under development", the module's name, its pipeline ID and the slice that delivers it, for example "Delivered by FF-1" or "After the retrofit (P1)".
- **No data:** it shows no data, makes no API call and holds no sample rows.
- **Wording and theme:** wording comes from ARB, colours only from `colorScheme` (rule 6).
- **Accessibility:** it has a screen-reader name and passes the ×1.4 check at 320 px.

## 4. The admin dashboard

- **Layout:** one shell (go_router `ShellRoute`), with a side menu on wide screens and a drawer on narrow ones. The menu lists the chosen role's modules from the registry, grouped by tier (P0, P1, P2, P3, then administration).
- **Home:** a home page per role, listing that role's modules with their state ("Ready" or "Under development") and their slice. It shows no figures.
- **Banners:** FF-0's "Development build: no sign-in" banner stays, and a second line names the account and role being viewed.

## 5. The development role switcher (reverses L154 ruling 2, for development only)

- **Admin page:** a switcher in the shell's header lists the seeded accounts: `superadmin@`, `malladmin@`, `editor@`, `viewer@`, `malladmin.demo@`. For an account holding two tenants, it also offers the tenant (ruling 3). The choice is kept in the page's local storage and sent on every request as `X-Dev-Act-As: <email>`, plus `X-Tenant-Id` when one is chosen.
- **Server (api-coder):** the stand-in honours `X-Dev-Act-As` only under its existing guard (`NODE_ENV` explicitly development or test). It accepts only accounts ending `@gabay.test` that exist and are active, and anything else gets 403. Without the header it acts as `DEV_STUB_USER_EMAIL`, as now. A new `GET /api/dev/accounts` lists those accounts with their roles and tenants for the switcher.
- **Menu by role:** the role decides the menu through the registry (§2). The server still checks no permissions until R2 (E-20, waiver 3).
- **Removal:** R8 deletes the switcher and the header, and R1 deletes the stand-in. The ledger gets rows for `GET /api/dev/accounts`, the header, the switcher and each dashboard shell.

## 6. The shopper app

The shell with the four tabs (§2), each a placeholder page, and the Map tab's placeholder saying "Delivered by FF-4". There is no package and no API call. FF-4's spec (P0-04, being written now) is revised to r2 to build on this shell instead of creating one.

## 7. Tests (failing first)

- **Registry:** every module has a name, a pipeline ID that exists in FEATURE_PIPELINE (a test reads the file) and a slice. Every role's menu matches §2's table exactly. SUPERADMIN gets every module. No module is shown to a role the table does not give it.
- **Placeholders:** each shows its name, ID and slice and makes no API call (a fake `ApiClient` that fails on any call). There is a screenshot of one admin placeholder and one shopper tab.
- **Switcher:**
  - the menu changes with the account;
  - the header is sent;
  - the server refuses a non-seeded or inactive account (403), and the header outside development or test, where the stand-in does not load at all;
  - `GET /api/dev/accounts` lists exactly the seeded accounts.
- **Accessibility:** screen-reader names on the menu, the switcher and the tabs, and no overflow at ×1.4 at 320 px.
- **Existing tests:** none change.

## 8. Records and order

- **Records:**
  - PRD §6.26 "Role dashboards (development skeleton)" and FEATURE_PIPELINE P0-16;
  - plan.html one row for the slice;
  - the retrofit ledger;
  - ARB wording and a changelog entry on both surfaces;
  - screenshots;
  - the frontend manual and smoke guide rows.
- **Order:** this builds on FF-0's client half (the banner and the lookups fetcher), so it starts when FF-0 merges. Then:
  1. api-coder: the act-as header and the accounts route;
  2. flutter-coder: the registry, the shells, the switcher and the placeholders;
  3. dod-reviewer;
  4. the fast lane.
- **Shopper tabs:** independent of the server work, so they can run beside step 1.

## 9. Rulings (2026-10-09, the product owner, each as recommended)

1. **VIEWER** gets every module MALL_ADMIN has in its tenant, read-only: nothing that writes (no publish, no edits) and no administration (users, roles and permissions, audit, settings). Not taken: results only (published map, analytics, forecasts); deciding at R2.
2. **The menus come from the app's module registry** until R8, which replaces it with the permission-driven menu (Phase 2 Q9). Not taken: seeding `PermissionRoute` and `RolePermission` now.
3. **The switcher picks the account and, for accounts holding two tenants, the tenant.** This also settles the P0-02 spec's question on reaching Spike Venues in the admin page. Not taken: the account only.
