# Intent P0-01 — Venue, building and level setup

> **Pipeline entry:** P0-01 · **Slice:** FF-1 (`plan/PH4-feature-first.md` §4) · **Date:** 2026-10-09 · **Status:** draft, for the product owner's approval with its spec (L156) · **Sources:** PRD §6.1; Blueprint §4.6, Part 3 §3.3; FEATURE_PIPELINE P0-01

## What the product owner wants
An admin creates and maintains a venue covering the whole property (its boundary), its buildings (main, wing, annex, parking) and their indoor levels plus the outdoor ground level, with real dimensions, grid cell size, each building's map "up" angle (L111) and a level's optional spoken name (L112), in the admin page on localhost. Lists with search and paging; forms as FieldSpec projections (rule 7) on S9's machinery and FF-0's read-only lookups (building types and the like, rule 5).

## Settled context
- **Order and constraints:** feature-first under EXCEPTIONS E-20 (plan.html L153; `plan/PH4-feature-first.md` 1.0): localhost only (L109), no deploy, throwaway test data only, nothing live until the retrofit (R1–R13) is signed. Admin routes sit behind the development stub (`plan/FF0-dev-stub-lookups.md`, L154, L155): no sign-in, tenant from `req.tenantCompanyID`, no permission check yet; definition-of-done items 3, 4 and 9 are waived only as `Waived: <item> — R<n>` with a retrofit-ledger row. The seven rules and every linter apply in full.
- **Product rulings:** the `gabay-product-rulings` skill (L83–L124 and later) governs behaviour; the Gabay Demo app is the main reference for the shopper side (L85, L99).
- **Approval:** this intent and its spec are approved together by the product owner, in one sitting with FF-1 to FF-4 (L156).

## Notes for the spec
**Definition-of-done item 15 in full (L155):** deactivate a referenced building type, open a building that uses it, save it, and the value survives, as an end-to-end test. Nested facility interiors hang under parent units (L29) only as far as the P0-01 model needs; the editor's drawing is P0-11 (FF-10).
