# Gabay — REVIEW.md

> **Version**: 1.0 | **Date**: 2026-10-07 | **Status**: in force (standard §8.6; plan.html L121) | **Audience**: dod-reviewer and any reviewer of a Gabay change | **Scope**: the passes a change goes through before the product owner signs its PR

Run the passes in order. Report each finding as `file:line`, the rule it breaks, and what fails because of it. A pass with nothing found says "none found" and what was checked. Never fix code here: report.

## 0. Verification (always first)
- Run `npm run verify` in a fresh context and paste its full output with the exit code. Anything other than `ALL GREEN` stops the review: report the failure.

## 1. Security pass
- Routes guarded in order: role → permission → tenant scope → validation (§9 item 3).
- Every tenant-scoped query carries its tenant predicate from the request context, never from the token's user object (rule 2).
- No value from a request is interpolated into SQL; sort keys, filters and lookup names go through an allow-list (rule 3).
- Firebase ID token verified before anything else; permissions read from the database (E-08).
- No secret, key or real password in the diff; `.env` never staged.
- Positions: nothing leaves the phone outside opted-in analytics (invariant 4); no background location or BLE (invariant 5).

## 2. Compliance pass (the standard and Gabay's rules)
- Rules 1–7 of `CLAUDE.md`: money as `decimal.js` and `DECIMAL(18,4)`; tenant predicate; no interpolation; migrations never edited and `schema.sql` updated with drops; no hardcoded option list; colours only in the theme tokens; forms as `FieldSpec`s.
- Every `FEATURE_PIPELINE.md` §5 item met or waived in one line: the standard's 15 and G1–G4.
- Seeds, permission and menu rows, manuals, smoke guide, changelog and the companion-file sync table updated (§9 items 2, 4, 10, 11, 12).
- New enumerable sets as tables or commented constants (§9 item 14).
- Decisions: behaviour that differs from the PRD or Blueprint has its `plan.html` row (G4).

## 3. Evidence pass (WORKING_AGREEMENT §4)
- The verify output is pasted, not described.
- Screen changes have test-rendered screenshots: light and dark, phone and tablet.
- The traceability table maps every acceptance criterion and edge case to a passing test or a one-line reason.
- Every changed existing test is named in `plan/<id>.md` with its spec change (C1).

## 4. Product pass (Gabay)
- Taglish: new phrases in the ARB files, the untranslated-phrase test passing, the product owner's review recorded (G2).
- Accessibility: screen-reader names, no overflow at ×1.4, contrast 4.5:1 (PRD §6.23).
- Offline: shopper features in PRD §6.5–§6.9 work with no data (G3).
- References: nothing copied from `demo_app` or `gabay_spike` (L34); the penthouse data stays internal (L48).

## 5. Scope and quality pass
- Only what the spec and plan say; anything else under `## Suggestions`.
- Scale targets stated in the spec are met, with the measurement pasted.
- No overengineering: no abstraction without a second use, except what the standard or Blueprint mandates.
- Clear names, one responsibility per file.

## 6. For the product owner (standard §9's human checks)
Answer only: does the change do what `plan/<id>.md` said; is the residual risk acceptable; is the tier still right; does anything belong in Blueprint Part 6 as a named rule. The product owner signs; this review does not.
