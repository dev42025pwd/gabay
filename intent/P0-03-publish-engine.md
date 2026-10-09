# Intent P0-03 — Publish engine with graph generation

> **Pipeline entry:** P0-03 · **Slice:** FF-3 (`plan/PH4-feature-first.md` §4) · **Date:** 2026-10-09 · **Status:** draft, for the product owner's approval with its spec (L156) · **Sources:** PRD §6.3; Blueprint §4.1, Part 3 §3.4–§3.5; FEATURE_PIPELINE P0-03; D6

## What the product owner wants
Validate a venue (reachability, orphans, paired connectors, boundary containment, beacon collisions, no walkway through a wall, L92; warnings for coverage gaps), generate the walkway graph from the walkable area plus corrections (L32), cost connectors in metres (L86, L91), handle walk-through stores and passages (L92), and write the immutable package (D6: a read-only SQLite file with FTS5, R*Tree and the CSR graph) with its SHA-256, as a VenueVersion; plus the admin publish screen showing the result or the problems on the map. On localhost: the package is stored locally (no Cloud Storage while E-20 is open).

## Settled context
- **Order and constraints:** feature-first under EXCEPTIONS E-20 (plan.html L153; `plan/PH4-feature-first.md` 1.0): localhost only (L109), no deploy, throwaway test data only, nothing live until the retrofit (R1–R13) is signed. Admin routes sit behind the development stub (`plan/FF0-dev-stub-lookups.md`, L154, L155): no sign-in, tenant from `req.tenantCompanyID`, no permission check yet; definition-of-done items 3, 4 and 9 are waived only as `Waived: <item> — R<n>` with a retrofit-ledger row. The seven rules and every linter apply in full.
- **Product rulings:** the `gabay-product-rulings` skill (L83–L124 and later) governs behaviour; the Gabay Demo app is the main reference for the shopper side (L85, L99).
- **Approval:** this intent and its spec are approved together by the product owner, in one sitting with FF-1 to FF-4 (L156).

## Notes for the spec
Spike 2 (package size, graph load, A* timing) runs first and may change format choices: the spec cites what it must not fix before Spike 2 reports. The publish write has no audit row until R3 (E-20).
