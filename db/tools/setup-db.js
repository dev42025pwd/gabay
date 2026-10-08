// npm run setup-db: the one orchestrator for a database (standard §8.2).
//
//   dev mode (default)   schema -> migrations -> test seed (db/seeds; starts the Auth emulator, which runs on Node: no Java)
//   --bootstrap          schema -> reference seed (platform lookups and roles) -> tenant provisioning (Phase 2)
//
//   --stop-on-error      stop at the first failed step (default: report it and run the rest)
//   --skip-schema        do not (re)apply db/schema.sql (it drops and recreates every table!)
//   --skip-migrations    dev mode only: do not apply db/migrations
//   --skip-seed          do not seed
//
// The exit code is the number of failed steps.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { connect, REPO_ROOT, DB_DIR } = require('./lib/connect');
const { runMigrations } = require('./lib/migrations');

const SCHEMA_FILE = path.join(DB_DIR, 'schema.sql');
/** Counts the signed schema 0.14 produces in schema `gabay` (db/schema.sql header, INSTALL.md A.1). */
const EXPECTED = Object.freeze({ tables: 56, indexes: 133, triggers: 1 });

const FLAGS = new Set([
  '--bootstrap',
  '--stop-on-error',
  '--skip-schema',
  '--skip-migrations',
  '--skip-seed',
]);

function parseArgs(argv) {
  const unknown = argv.filter((a) => !FLAGS.has(a));
  if (unknown.length) {
    throw new Error(`Unknown option(s): ${unknown.join(' ')}\nKnown: ${[...FLAGS].join(' ')}`);
  }
  const has = (f) => argv.includes(f);
  return {
    bootstrap: has('--bootstrap'),
    stopOnError: has('--stop-on-error'),
    skipSchema: has('--skip-schema'),
    skipMigrations: has('--skip-migrations'),
    skipSeed: has('--skip-seed'),
  };
}

/** Applies db/schema.sql as ONE parameterless query (plan §6; no psql, no GO splitter). */
async function applySchema(client) {
  const notices = [];
  const onNotice = (n) => notices.push(n.message);
  client.on('notice', onNotice);
  try {
    await client.query(fs.readFileSync(SCHEMA_FILE, 'utf8'));
  } finally {
    client.off('notice', onNotice);
  }
  const count = async (sql) => Number((await client.query(sql)).rows[0].n);
  const found = {
    tables: await count(
      "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = 'gabay' AND table_type = 'BASE TABLE'",
    ),
    indexes: await count("SELECT COUNT(*) AS n FROM pg_indexes WHERE schemaname = 'gabay'"),
    triggers: await count(
      `SELECT COUNT(*) AS n
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace s ON s.oid = c.relnamespace
        WHERE s.nspname = 'gabay' AND NOT t.tgisinternal`,
    ),
  };
  console.log(
    `Schema applied (${notices.length} notice(s), e.g. "does not exist, skipping" on a first run).`,
  );
  console.log(
    `Schema gabay now has ${found.tables} tables, ${found.indexes} indexes, ${found.triggers} trigger(s).`,
  );
  if (
    found.tables !== EXPECTED.tables ||
    found.indexes !== EXPECTED.indexes ||
    found.triggers !== EXPECTED.triggers
  ) {
    // A warning, not a failure: the counts move legitimately when the schema changes (update EXPECTED then).
    console.warn(
      `WARNING: expected ${EXPECTED.tables} tables, ${EXPECTED.indexes} indexes, ${EXPECTED.triggers} trigger(s) (schema 0.14). Is db/schema.sql a different version?`,
    );
  }
}

/** The reference seed: platform lookups and roles only (db/seeds/lib/lookups.js), no tenants, no accounts. */
async function seedReference(client) {
  const { seedPlatform } = require(path.join(DB_DIR, 'seeds', 'lib', 'lookups.js'));
  await client.query('BEGIN');
  try {
    const ids = await seedPlatform(client);
    await client.query('COMMIT');
    const summary = Object.entries(ids)
      .map(([table, byCode]) => `${table} ${Object.keys(byCode).length}`)
      .join(', ');
    console.log(`Reference data seeded (platform rows, TenantId NULL): ${summary}.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
}

/**
 * The dev seed is the existing seed project. It starts the Firebase Auth emulator, which runs on Node: firebase-tools
 * 15.32.1 needs Java only for the Firestore, Realtime Database and Storage emulators (source check 2026-10-08:
 * downloadableEmulators.js, `binary: "java"` on exactly those three), and Gabay starts none of them.
 */
function runDevSeed() {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  // Fixed arguments, nothing from the user. shell:true is required to start a .cmd file on Windows.
  const result = spawnSync(`${npm} --prefix db/seeds run seed`, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) throw new Error(`the test seed exited with code ${result.status}`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`setup-db: ${opts.bootstrap ? 'bootstrap' : 'dev'} mode`);

  const steps = [];
  if (!opts.skipSchema) steps.push(['schema', (c) => applySchema(c)]);
  if (opts.bootstrap) {
    if (!opts.skipSeed) steps.push(['reference seed', (c) => seedReference(c)]);
    steps.push([
      'tenant provisioning',
      async () => console.log('Tenant provisioning: Phase 2 (no tenants are created in Phase 1).'),
    ]);
  } else {
    if (!opts.skipMigrations) steps.push(['migrations', (c) => runMigrations(c)]);
    if (!opts.skipSeed) {
      // The seed opens its own connection; close ours first so it never waits on a lock of ours.
      steps.push(['test seed', async (c) => c.end().then(() => runDevSeed())]);
    }
  }

  const client = await connect();
  let ended = false;
  const failed = [];
  try {
    for (const [name, step] of steps) {
      console.log(`\n== ${name} ==`);
      try {
        await step(client);
        if (name === 'test seed') ended = true;
        console.log(`-- ${name}: ok`);
      } catch (err) {
        if (name === 'test seed') ended = true;
        failed.push(name);
        console.error(`-- ${name}: FAILED: ${err.message}`);
        if (opts.stopOnError) break;
      }
    }
  } finally {
    if (!ended) await client.end();
  }

  console.log(
    failed.length
      ? `\nsetup-db finished with ${failed.length} failed step(s): ${failed.join(', ')}`
      : '\nsetup-db finished: every step ok.',
  );
  process.exitCode = failed.length;
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
