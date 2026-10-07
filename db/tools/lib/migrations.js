// The migration runner (standard §8.2). db/migrations/NNNN_name.sql, applied in order, every time:
// each migration is idempotent (IF NOT EXISTS, guarded DO blocks), so there is no ledger table
// (plan DC-4). Each file runs as ONE parameterless pg query inside a transaction (plan §6: pg runs
// several statements only when there are no parameters), then its verification query runs and its
// rows are printed, so the operator sees the effect and not just "applied".
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DB_DIR } = require('./connect');

const MIGRATIONS_DIR = path.join(DB_DIR, 'migrations');
/** Zero-padded: unpadded, 100_ sorts before 19_ and the run order silently changes. */
const NAME_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;

/**
 * The verification query: the comment lines after a `-- verify:` line, joined. Convention:
 *
 *   -- verify:
 *   -- SELECT COUNT(*) AS columns FROM information_schema.columns WHERE table_name = 'x';
 *
 * Returns null when there is none, or when it is not a single SELECT.
 */
function extractVerifyQuery(sql) {
  const lines = sql.split(/\r?\n/);
  const at = lines.findIndex((l) => /^--\s*verify:\s*$/i.test(l.trim()));
  if (at === -1) return null;
  const body = [];
  for (const line of lines.slice(at + 1)) {
    const m = /^--\s?(.*)$/.exec(line.trim());
    if (!m) break;
    body.push(m[1]);
  }
  const query = body.join('\n').trim().replace(/;\s*$/, '');
  if (!/^select\b/i.test(query) || query.includes(';')) return null;
  return query;
}

/** Lists and validates every migration file. Returns [{ name, file, sql, verify }] in run order. */
function readMigrations(dir = MIGRATIONS_DIR) {
  if (!fs.existsSync(dir)) return [];
  const sqlFiles = fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.sql'))
    .sort();
  const problems = [];
  const migrations = sqlFiles.map((name) => {
    const file = path.join(dir, name);
    if (!NAME_PATTERN.test(name)) {
      problems.push(`${name}: the name must match NNNN_name.sql (four digits, lower case).`);
      return null;
    }
    const sql = fs.readFileSync(file, 'utf8');
    const verify = extractVerifyQuery(sql);
    if (!verify) {
      problems.push(
        `${name}: no verification query. End the file with "-- verify:" and one commented SELECT.`,
      );
    }
    return { name, file, sql, verify };
  });
  const numbers = sqlFiles.map((f) => f.slice(0, 4)).filter((n) => /^\d{4}$/.test(n));
  for (const n of new Set(numbers.filter((n, i) => numbers.indexOf(n) !== i))) {
    problems.push(`number ${n} is used by more than one migration.`);
  }
  if (problems.length) {
    throw new Error(`Migrations refused:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }
  return migrations;
}

/** Applies every migration in order. Stops at the first failure (its transaction rolls back). */
async function runMigrations(client, dir = MIGRATIONS_DIR) {
  const migrations = readMigrations(dir);
  if (migrations.length === 0) {
    console.log('No migrations found in db/migrations (none exist yet). Nothing to apply.');
    return 0;
  }
  for (const m of migrations) {
    console.log(`Applying ${m.name} ...`);
    try {
      await client.query('BEGIN');
      await client.query(m.sql);
      const { rows } = await client.query(m.verify);
      await client.query('COMMIT');
      console.log(`  applied. Verification (${m.name}):`);
      if (rows.length === 0) console.log('  (no rows)');
      else console.table(rows);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw new Error(`${m.name} failed and was rolled back: ${err.message}`);
    }
  }
  console.log(`${migrations.length} migration(s) applied.`);
  return migrations.length;
}

module.exports = {
  runMigrations,
  readMigrations,
  extractVerifyQuery,
  MIGRATIONS_DIR,
  NAME_PATTERN,
};
