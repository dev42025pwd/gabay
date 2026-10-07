# tools/lint: the structural linters

Plan S4, standard §7.2. Each linter encodes one mistake this project must never ship, names the file and line it fails on (`path:line: rule: message`), and has a test that feeds it a bad sample and expects the failure. No dependencies: plain Node 22, run from the repository root.

```sh
npm run lint:structural                        # all ten, whole repo; exit code = number of violations (max 255)
npm run test:schema-forms                      # the schema-to-form drift linter alone (§7.2)
npm run lint:test                              # the linters' own tests (node --test)
node tools/lint/run.js no-snackbar colour-literals   # only some
node tools/lint/run.js --files app/lib/a.dart functions/src/b.js   # only these files (pre-commit)
node tools/lint/run.js migrations-immutable --staged               # the index against HEAD (pre-commit)
node tools/lint/run.js migrations-immutable --base origin/main     # REF...HEAD (CI)
```

| Rule | Catches | Source |
|---|---|---|
| `schema-drops` | a `CREATE TABLE` in `db/schema.sql` without its `DROP TABLE IF EXISTS` | §8.2 |
| `schema-forms` | a `FieldSpec` that disagrees with `schema.sql` (kind, nullability, length, scale); the Dart shape it parses is in the header of `schema-forms.js` | §7.2, A.13 |
| `no-bare-textfield` | `TextFormField(` / `TextField(` in `app/lib/features/**/views/` | rule 7 |
| `colour-literals` | `Color(0x`, `Color.fromARGB/RGBO(`, `Colors.*`, `.primaryColor` outside `gabay_tokens.dart` | rule 6, §4.7 |
| `sql-interpolation` | a `${}` inside SQL text, or SQL joined to a variable with `+`, in `functions/src` | rule 3 |
| `tenant-predicate` | SQL on a tenant-scoped table (read from `schema.sql`) with no `TenantId` predicate | rule 2 |
| `position-privacy` | position code and network code imported together outside `core/analytics/` | invariant 4 |
| `foreground-manifest` | background location / Bluetooth in `AndroidManifest.xml` or `Info.plist` | Foreground rule |
| `migrations-immutable` | bad migration names, repeated numbers, a committed migration edited, deleted or renamed | rule 4, §8.2 |
| `no-snackbar` | `showSnackBar(` / `ScaffoldMessenger` in `app/lib` | §4.6 |

## Annotations (reason required)

Two rules have an escape hatch, a comment on the line directly above the SQL, with a non-empty reason (an empty one is itself a violation):

```js
// sql-identifiers: orderBy comes from the caller's sortMap allow-list
const page = await query(`SELECT ... ORDER BY ${paging.orderBy}`, params);

// tenant-scope: platform job, reads every tenant on purpose
const all = await query('SELECT TenantId FROM gabay.Venue', []);
```

## Skipped everywhere

`node_modules/`, `build/`, `.dart_tool/`, `.git/`, `Pods/`, generated `app/lib/l10n/app_localizations*.dart`, and `tools/lint/test/fixtures/`.

## Layout

`run.js` runs them; `lib/` holds the shared parts (`scan.js` tells code from comments and strings, `context.js` lists and reads files, `schema.js` reads `db/schema.sql`, `sql.js` finds SQL text). One file per linter; the tests build throwaway trees in a temp directory (and a temp git repository for the migration history checks), so no bad sample is committed.
