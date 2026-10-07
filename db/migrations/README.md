# db/migrations

Additive history for `db/schema.sql` (standard §8.2, CLAUDE.md rule 4). **None exist yet**: the signed schema is the whole database today.

## Conventions

1. **Name:** `NNNN_snake_case_name.sql`, a four-digit zero-padded number (`0001_add_x.sql`). Unpadded numbers sort wrong (`100_` before `19_`). The runner refuses any other name and any repeated number.
2. **Never edited once committed.** A change is a new file with the next number, and `db/schema.sql` is updated to match in the same commit. The `migrations-immutable` linter (plan S4) enforces this.
3. **Idempotent.** Every migration is safe to run again on a database that already has it (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, guarded `DO` blocks). There is no ledger table (plan DC-4): the runner applies every file, in order, every time.
4. **One transaction per file.** The runner sends the file as one query inside `BEGIN`/`COMMIT`, so a failure leaves the database as it was. Do not put `BEGIN`/`COMMIT` in the file, and avoid statements PostgreSQL cannot run in a transaction (`CREATE INDEX CONCURRENTLY`).
5. **A verification query.** End the file with a `-- verify:` line followed by commented lines holding **one** `SELECT`. The runner runs it after the migration and prints the rows, so the operator sees the effect:

   ```sql
   ALTER TABLE gabay.Venue ADD COLUMN IF NOT EXISTS Example VARCHAR(40) NULL;

   -- verify:
   -- SELECT column_name, data_type FROM information_schema.columns
   --  WHERE table_schema = 'gabay' AND table_name = 'venue' AND column_name = 'example';
   ```

   A migration without one is refused.

6. **Identifiers** are written PascalCase and never quoted, as in `schema.sql`.

## Running

```sh
npm run migrate        # apply all, in order; with none present it says so and exits 0
npm run setup-db       # dev mode: schema -> migrations -> test seed (see INSTALL.md)
```
