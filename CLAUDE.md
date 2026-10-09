# CLAUDE.md

Gabay: indoor wayfinding for Philippine malls (a Flutter shopper app, a Flutter Web admin page, one Express API as a Cloud Function, PostgreSQL). Phase 1 (rails) is done, its gate signed 2026-10-09 (L148, `phase-reports/phase-1.md`); Phase 2 starts when the product owner approves its plan (L146); no product feature exists yet. Local first (L109): everything runs on this machine until the product owner calls a deploy. Replies to the product owner: plain language, recommendation first, evidence pasted (WORKING_AGREEMENT §1, §4).

## Commands (Node 22: in Git Bash `"$LOCALAPPDATA/Microsoft/WinGet/Links/fnm.exe" exec --using=22 -- npm.cmd run <script>`)
- `npm run verify`: every check (linters and their tests, ESLint, Prettier, API and tool tests, `db/schema.sql` twice, the seed, the Functions emulator health, `flutter analyze`, `flutter test`). Healthy output ends `ALL GREEN`; the exit code is the number of failures. Run it before reporting any task complete and paste the output. If a test fails, fix the code, not the test. A failing check's whole output (the console shows its last 30 lines) is in `.verify/logs/<check>.log`, named on its FAIL line; each run empties that folder first, so it holds the latest run's failures only. One run at a time on this machine (each working copy has its own database; the emulator ports stay shared): a second run prints `verify is busy: held by <who> ...` and waits, up to `GABAY_VERIFY_LOCK_WAIT_MS` (default 15 minutes, then exit 2 and nothing recorded). Set `GABAY_VERIFY_OWNER` (for example `api-coder`) so the lock names you; CI takes no lock.
- Coder working copies (plan/PH1-worktrees.md): `npm run worktree:new -- <name> [<branch>]` makes `C:\Users\User\FlutterProjects\Gabay-wt\<name>` (a git worktree on its own branch, its own `.env` and database `gabay_wt_<name>`, packages installed, `setup-db` run); `npm run worktree:remove -- <name> [--force]` removes it and drops the database. `<name>` is `api-coder`, `flutter-coder`, `engine-coder`, `native-ble` or `test-verifier`. Run both from the main folder. The Claude Code hooks: the edit hook checks the repository of the edited file; the Stop hooks always check the main folder and also the working copy the shell is in, each from its own baseline. `test-verifier` works in the coder's copy of the work it tests, and has its own copy only when the task says so.
- Parts: `npm run lint:structural`, `lint:test`, `tools:test`, `api:test`, `api:lint`, `test:schema-forms`, `setup-db`, `migrate`, `seed`, `ci:guards` (CI's secret and changelog-duplicate guards). `GABAY_VERIFY_CHECK_TIMEOUT_MS` caps each verify check (CI sets it). In `app/`: `flutter analyze`, `flutter test`; screenshots with `flutter test test/screenshot_test.dart --dart-define=SHOTS_OUT=<dir>`. Do not invent commands; add new ones here.
- Local database: PostgreSQL 18.6, `localhost:5432`, database `gabay_dev` (working copies: `gabay_wt_<name>`); the password is in the local `.env` (never committed). The Auth emulator project is `demo-gabay`.
- Once per clone: `git config core.hooksPath .githooks`. The hooks (pre-commit, post-commit, pre-push, and the Claude Code Stop, SessionStart and after-Dart-edit hooks) are listed in README and `WORKING_AGREEMENT.md` §6.

## Stack and the seven rules
Flutter + Riverpod (MVVM: View → ViewModel → stateless Service), dio through one `ApiClient`, go_router with `usePathUrlStrategy()`; Node 22 + Express in one Cloud Function (`maxInstances = 1`, Singapore); PostgreSQL via `pg` with raw parameterized SQL, no ORM; Firebase Auth with roles in the database. Never Firestore or the Realtime Database; never React, Vue, Angular, Python or PHP backends, MySQL, MongoDB, an ORM, float money or `moment`. Pins: Blueprint Part 1 only. Any deviation from the standard's §1 needs written lead sign-off (the product owner, under Raphael Mendoza's delegation, L115) and an `EXCEPTIONS.md` entry with an expiry date; Gabay's are E-02 to E-18 (E-11 withdrawn).
1. Money is `decimal.js` and `DECIMAL(18,4)`; never a float. *(review)*
2. Every tenant-scoped query binds its tenant from the request context (`req.tenantCompanyID`), never from the token's user object. *(`tenant-predicate` checks the binding; review checks the source)*
3. Never interpolate a request value into SQL; allow-list maps for sort keys, filters and lookups. *(`sql-interpolation`)*
4. A committed migration is never edited: new zero-padded migration plus `schema.sql`, every `CREATE TABLE` with its `DROP TABLE`. *(`migrations-immutable`, `schema-drops`)*
5. No hardcoded option list a client could extend: a table, a maintenance screen, `/api/lookups/:name`. *(review)*
6. Colours only in `app/lib/core/theme/gabay_tokens.dart`; `Theme.of(context).colorScheme.*`. *(`colour-literals`)*
7. Forms are schema projections: one `FieldSpec` per field, never a bare `TextField`. *(`no-bare-textfield`, `schema-forms`)*

## Where things are
- Required reading before any work: `docs/process/WORKING_AGREEMENT.md` (how we work; process rulings are recorded there in the same turn) and, for the area you touch, `docs/product/GABAY_MASTER_BLUEPRINT.md` (Part 1 constraints and known traps, Part 3 schema, Part 4 modules).
- Definition of done: `docs/product/FEATURE_PIPELINE.md` §5. Review passes: `REVIEW.md`. Decisions: `plan.html` (append-only log). Product: `docs/product/GABAY_PRD.md`, `db/schema.sql`. Exceptions: `docs/process/EXCEPTIONS.md`.
- **Product rulings** (the Gabay Demo app as the main reference, L83–L124): the project skill `gabay-product-rulings`. Load it before any spec, plan, build, test or review touching the shopper app, the admin page, maps, routing, positioning, voice, wording, analytics or seeds. A gap it does not settle: stop and ask.
- The standard: `Engineering Standards.html`, a single-page viewer; read the raw file (Markdown inside `<script type="text/plain" id="src-...">`; grep `^#{1,3} ` or `id="src-`). Its `prd`, `blueprint` and `pipeline` blocks are RetailPOS examples, not Gabay requirements.

## Companion-file sync table (§8.5): evaluate every row before marking work done; update in the same turn, or say in one line why not
| When this changes | Also update |
|---|---|
| `db/schema.sql` | a new migration in `db/migrations/`; the seeds; Blueprint Part 3; `db/SCHEMA_READING_GUIDE.md`; the affected `FieldSpec`s |
| An API route | its tests; the e2e suite (from P0); permission and menu rows in the seed; Blueprint Part 4 (and Part 1's API conventions if they move); `docs/testing/E2E_Test_Cases_Manual.md` |
| A screen or its wording | `app/lib/l10n/app_en.arb` (Tagalog with P0-14); a changelog entry (`app/lib/core/config/changelog.dart` + ARB bullet); screenshots; `docs/testing/E2E_Frontend_Test_Cases_Manual.md` and `Smoke_Test_Guide.md` |
| A dependency | its Blueprint Part 1 pin; an EXCEPTIONS entry if §1 does not name it |
| A setting, limit or option list | the `GlobalSetting` or lookup seed; `.env.example` if it is an env value; the Blueprint |
| A command or check | this file's Commands; README; `INSTALL.md` if setup changes; `tools/verify.js` if it is a check |
| An owner ruling | a `plan.html` row (version bump, changelog row); every document it touches; this file, or the `gabay-product-rulings` skill for a product ruling; the modules page (https://claude.ai/artifact/QFDHQAvkiDL93hM76Kb9mt) |
| A pipeline entry's state | `FEATURE_PIPELINE.md` (DONE marker, §6) |
| A deploy or an incident | `docs/ops/DEPLOYMENT_RUNBOOK.md` / `docs/ops/INCIDENTS.md` |

## Things agents get wrong here
- `fnm` is not on an agent's PATH in Git Bash: call `"$LOCALAPPDATA/Microsoft/WinGet/Links/fnm.exe"`; use `npm.cmd`, not `npm`; the default Node is 24.
- The git index is shared by parallel agents: commit with `git commit -- <paths>` (a new file needs `git add <path>` first), never a bare `git commit -a`.
- A hook file loses its executable bit on a pathspec commit (`core.fileMode` is false): `git update-index --chmod=+x <file>`.
- `plan.html` is edited by other sessions too: re-read its version and next L-row before editing; check `<tr>`/`<li>` balance after.
- Never start `npm run verify` expecting the machine to be yours, and never kill another run's emulator or delete its lock to get in: the lock makes you wait and says who holds it. A lock left by a dead run is cleared by the next run.
- `npm run seed:db-only` (in `db/seeds`) deletes the test accounts; restore them with the full `npm run seed`.
- Never print or commit `.env` values. Never copy code from `demo_app` or `gabay_spike` (L34); the penthouse data stays out of git (L48, L123).
- The Blueprint's `<known_traps>` (Part 1) list the domain traps (global lookups `TenantId = $t OR TenantId IS NULL`, frozen rows, and more): read them before database or engine work.

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
- **Phase gate:** agents are dormant until the product owner's declaration is recorded here as a line `Phase 1 declared <date> (L-row)`. If that line is absent, stop and ask.

  Phase 1 declared 2026-10-07 (L122)

  The declaration wakes the agents and approves no work: each Phase 1 task, the rails included, needs the product owner's approved plan, and every repository, push or deploy waits for their call. Phase 2 and every later phase start when the product owner approves their plan; no further declaration (L146).
- **Models (L62, L122; WORKING_AGREEMENT §8):** Sonnet 5.5 for well-defined coding; Opus 5.5 or Fable 5.1, by weight, for analysis and decisions. Every important scenario goes to the product owner first, including any move to Opus or Fable. Model IDs and library APIs come from a doc check, never from memory (L121).
- **Pipeline:** intent → spec (spec-writer) → plan (main session; the product owner approves; it cites the spec revision) → diff (coders) → tests (test-verifier) → review (dod-reviewer) → the product owner's sign-off. Files are named by pipeline ID: `intent/<id>-<slug>.md`, `spec/<id>.md`, `plan/<id>.md`.
- **Evidence:** paste command output; never write "should work". Tag an unchecked library, framework or API claim RECALLED; verify a load-bearing one (doc fetch or source check) or stop and ask.
- **Scope:** build only what the spec and plan say; anything else under `## Suggestions`. Spec and plan disagree: stop and ask, quoting both. The spec moved past the revision the plan cites: stop and ask.
- **Edge cases:** every one in the spec gets a test or a one-line reason why not.
- **Ambiguity:** never guess. Subagents cannot ask the product owner: they stop and return `## Questions for the user`, each tagged `[<agent-name>]`, with 2–3 options and the recommended one first; the main session asks and resumes them.
- **Code quality:** clean, readable, maintainable, clear names, one responsibility per file, scalable to the spec's stated targets (cite them); extract on the second use, except what the standard or Blueprint mandates (C2).
- **Dependencies:** versions from the Blueprint Part 1 pins, never from another repo (gabay_spike included); a new one needs a pin and, outside §1, an EXCEPTIONS entry (C8). Limits are named constants, env values or settings (C8).
- **Tests:** an existing test changes only when `plan/<id>.md` names it and the spec change behind it (C1); list every changed test with a one-line reason.
- **Done:** every §9 item met or waived in one line. dod-reviewer's check is an AI self-check; the product owner signs off.
