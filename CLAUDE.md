# CLAUDE.md

Gabay: indoor wayfinding for Philippine malls (a Flutter shopper app, a Flutter Web admin page, one Express API as a Cloud Function, PostgreSQL). Phase 1 (rails) is under way on `plan/PH1-rails.md`; no product feature exists yet. Local first (L109): everything runs on this machine until the product owner calls a deploy.

## Commands (Node 22 via fnm; in Git Bash: `fnm exec --using=22 -- npm.cmd run <script>`)
- `npm run verify`: every check (linters and their tests, ESLint, Prettier, API and tool tests, `db/schema.sql` twice, the seed, the Functions emulator health, `flutter analyze`, `flutter test`). Healthy output ends `ALL GREEN`; the exit code is the number of failures. Run it before reporting any task complete and paste the output. If a test fails, fix the code, not the test.
- Parts: `npm run lint:structural`, `lint:test`, `tools:test`, `api:test`, `api:lint`, `test:schema-forms`, `setup-db`, `migrate`, `seed`. In `app/`: `flutter analyze`, `flutter test`; screenshots with `flutter test test/screenshot_test.dart --dart-define=SHOTS_OUT=<dir>`.
- Local database: PostgreSQL 18.6, `localhost:5432`, database `gabay_dev`; the password is in the local `.env` (never committed). The Auth emulator project is `demo-gabay`.
- Once per clone: `git config core.hooksPath .githooks`. Hooks: pre-commit (secret guard, changelog duplicate guard, linters on the staged content, version stamp), pre-push (`npm run verify`, checked-out commit, clean tree), Claude Stop hooks (no finishing until verify has run on the current code; no finishing when screens changed without a changelog entry unless the final message has a line `Changelog waived: <reason>`). README has the details.

## Stack and the seven rules
Flutter + Riverpod (MVVM: View → ViewModel → stateless Service), dio through one `ApiClient`, go_router with `usePathUrlStrategy()`; Node 22 + Express in one Cloud Function (`maxInstances = 1`, Singapore); PostgreSQL via `pg` with raw parameterized SQL, no ORM; Firebase Auth with roles in the database. Gabay's deviations from the standard's §1 stack are EXCEPTIONS E-02 to E-17 (L98, L115). Never Firestore or the Realtime Database; never React, Vue, Angular, Python, PHP, MySQL, MongoDB, an ORM, float money or `moment`. Pins: Blueprint Part 1 only.
1. Money is `decimal.js` and `DECIMAL(18,4)`; never a float. *(review)*
2. Every tenant-scoped query binds its tenant from the request context. *(`tenant-predicate`)*
3. Never interpolate a request value into SQL; allow-list maps for sort keys, filters and lookups. *(`sql-interpolation`)*
4. A committed migration is never edited: new zero-padded migration plus `schema.sql`, every `CREATE TABLE` with its `DROP TABLE`. *(`migrations-immutable`, `schema-drops`)*
5. No hardcoded option list a client could extend: a table, a maintenance screen, `/api/lookups/:name`. *(review)*
6. Colours only in `app/lib/core/theme/gabay_tokens.dart`; `Theme.of(context).colorScheme.*`. *(`colour-literals`)*
7. Forms are schema projections: one `FieldSpec` per field, never a bare `TextField`. *(`no-bare-textfield`, `schema-forms`)*

## Where things are
- How we work: `docs/process/WORKING_AGREEMENT.md` (ask, never assume; approvals; evidence; tests; hooks; models). Read it before any work. Process rulings are recorded there in the same turn.
- Definition of done: `docs/product/FEATURE_PIPELINE.md` §5. Review passes: `REVIEW.md`. Decisions: `plan.html` (append-only log). Product: `docs/product/GABAY_PRD.md`, `GABAY_MASTER_BLUEPRINT.md`, `db/schema.sql`. Exceptions: `docs/process/EXCEPTIONS.md`.
- **Product rulings** (the Gabay Demo app as the main reference, L83–L123): the project skill `gabay-product-rulings`. Load it before any spec, plan, build, test or review touching the shopper app, the admin page, maps, routing, positioning, voice, wording, analytics or seeds. A gap it does not settle: stop and ask.
- The standard: `Engineering Standards.html`, a single-page viewer; read the raw file (Markdown inside `<script type="text/plain" id="src-...">`; grep `^#{1,3} `). Its `prd`, `blueprint` and `pipeline` blocks are RetailPOS examples, not Gabay requirements.

## Companion-file sync table (§8.5): evaluate every row before marking work done; update in the same turn, or say in one line why not
| When this changes | Also update |
|---|---|
| `db/schema.sql` | a new migration in `db/migrations/`; the seeds; Blueprint Part 3; the affected `FieldSpec`s |
| An API route | its tests; permission and menu rows in the seed; Blueprint §3; the E2E manual in `docs/testing/` |
| A screen or its wording | `app_en.arb` (Tagalog with P0-14); a changelog entry (`changelog.dart` + ARB bullet); screenshots; the E2E manual and `Smoke_Test_Guide.md` |
| A dependency | its Blueprint Part 1 pin; an EXCEPTIONS entry if §1 does not name it |
| A setting, limit or option list | the `GlobalSetting` or lookup seed; the Blueprint |
| A command or check | this file's Commands; README; `tools/verify.js` if it is a check |
| An owner ruling | a `plan.html` row (version bump, changelog row); every document it touches; this file or the skill; the modules page |
| A pipeline entry's state | `FEATURE_PIPELINE.md` (DONE marker, §6) |
| A deploy or an incident | `docs/ops/DEPLOYMENT_RUNBOOK.md` / `docs/ops/INCIDENTS.md` |

## Things agents get wrong here
- `npm` under fnm in Git Bash: use `npm.cmd`; the default Node is 24, so run through `fnm exec --using=22`.
- The git index is shared by parallel agents: commit with `git commit -- <paths>` (a new file needs `git add <path>` first), never a bare `git commit -a`.
- A hook file loses its executable bit on a pathspec commit (`core.fileMode` is false): `git update-index --chmod=+x <file>`.
- `plan.html` is edited by other sessions too: re-read its version and next L-row before editing; check `<tr>`/`<li>` balance after.
- `npm run seed:db-only` (in `db/seeds`) deletes the test accounts; restore them with the full `npm run seed`.
- Never print or commit `.env` values. Never copy code from `demo_app` or `gabay_spike` (L34); the penthouse data stays out of git (L48, L123).
- Model IDs and library APIs come from a doc check this session, never from memory (L121, L122).

## Evidence Standard (the product owner's text, kept verbatim; L131)

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

## Rules every product agent carries (L61, L64; keep this section)
- **Phase gate:** agents are dormant until the line below exists. Phase 1 declared 2026-10-07 (L122). The declaration approves no work: each task needs the product owner's approved plan, and every repository, push or deploy waits for their call.
- **Models (L62, L122):** Sonnet 5.5 for well-defined coding; Opus 5.5 or Fable 5.1, by weight, for analysis and decisions; every important scenario goes to the product owner first.
- **Pipeline:** intent → spec (spec-writer) → plan (main session; the product owner approves; it cites the spec revision) → diff (coders) → tests (test-verifier) → review (dod-reviewer) → the product owner's sign-off. Files are named by pipeline ID: `intent/<id>-<slug>.md`, `spec/<id>.md`, `plan/<id>.md`.
- **Evidence:** paste command output; never write "should work". Tag an unchecked library, framework or API claim RECALLED; verify a load-bearing one (doc fetch or source check) or stop and ask.
- **Scope:** build only what the spec and plan say; anything else under `## Suggestions`. Spec and plan disagree: stop and ask, quoting both. The spec moved past the revision the plan cites: stop and ask.
- **Edge cases:** every one in the spec gets a test or a one-line reason why not.
- **Ambiguity:** never guess. Subagents return `## Questions for the user`, each tagged `[<agent-name>]`, with 2–3 options and the recommended one first; the main session asks the product owner.
- **Code quality:** clean, readable, one responsibility per file, scalable to the spec's stated targets (cite them); extract on the second use, except what the standard or Blueprint mandates (C2).
- **Dependencies:** versions from the Blueprint Part 1 pins, never from another repo; a new one needs a pin and, outside §1, an EXCEPTIONS entry (C8). Limits are named constants, env values or settings.
- **Tests:** an existing test changes only when `plan/<id>.md` names it and the spec change behind it (C1); list every changed test with a one-line reason.
- **Done:** every §9 item met or waived in one line. dod-reviewer's check is an AI self-check; the product owner signs off.
