# Intent P0-06 — Routing engine

> **Pipeline entry:** P0-06 · **Slice:** FF-4 (`plan/PH4-feature-first.md` §4) · **Date:** 2026-10-09 · **Status:** draft, for the product owner's approval with its spec (L156) · **Sources:** PRD §6.6; Blueprint §4.2, Part 1 invariants 6 and 15; FEATURE_PIPELINE P0-06; L79, L80, L86, L87, L92, L99, L110

## What the product owner wants
A* in a long-lived worker isolate over the package's CSR graph: the shortest route in metres with connector metre costs, one-way escalators only their way (L86), one other way shown unasked (L87), store shortcuts and passages (L92), the stairs rule (L99), the RG2 metre heuristic and RG3 origin snap (L79), with shared test vectors (One Router). Tap a store on the FF-4 map and see the route.

## Settled context
- **Order and constraints:** feature-first under EXCEPTIONS E-20 (plan.html L153; `plan/PH4-feature-first.md` 1.0): localhost only (L109), no deploy, throwaway test data only, nothing live until the retrofit (R1–R13) is signed. Admin routes sit behind the development stub (`plan/FF0-dev-stub-lookups.md`, L154, L155): no sign-in, tenant from `req.tenantCompanyID`, no permission check yet; definition-of-done items 3, 4 and 9 are waived only as `Waived: <item> — R<n>` with a retrofit-ledger row. The seven rules and every linter apply in full.
- **Product rulings:** the `gabay-product-rulings` skill (L83–L124 and later) governs behaviour; the Gabay Demo app is the main reference for the shopper side (L85, L99).
- **Approval:** this intent and its spec are approved together by the product owner, in one sitting with FF-1 to FF-4 (L156).

## Notes for the spec
The latency target is OPEN until Spike 2 (Blueprint OQ6, L117): the spec states the spike-measured numbers as provisional. Find-another-way, off-route and browsing (L80, L110) are named in or out explicitly.
