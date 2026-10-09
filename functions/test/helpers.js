// Shared test helpers. Tests run against the copy's own database (PGDATABASE in its .env: gabay_dev in the main
// folder; plan DC-6). A test may create a TEMP table on a single-connection pool, or read, or (owner's ruling L151,
// P2-S1 review I5) write the real tables INSIDE A TRANSACTION THAT IS ALWAYS ROLLED BACK (authHelpers.js:
// openRolledBackDb), so nothing is ever kept and no committed or seeded row is changed. It never COMMITs.
'use strict';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

const { loadEnvFile, parseConfig } = require('../src/config');
const { createDb } = require('../src/db');
const { createApp } = require('../src/app');

loadEnvFile();

/** The validated config from the root .env, with optional overrides of the raw env keys. */
function testConfig(overrides = {}) {
  return parseConfig({ ...process.env, ...overrides });
}

/**
 * A logger that records calls instead of printing them. child(bindings) returns a logger that records
 * into the same calls, with the bindings merged into the first (object) argument, as pino does.
 */
function fakeLogger(bindings = {}, calls = { info: [], warn: [], error: [] }) {
  const record =
    (level) =>
    (first, ...rest) =>
      calls[level].push(
        typeof first === 'string' ? [first, ...rest] : [{ ...bindings, ...first }, ...rest],
      );
  return {
    calls,
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
    child: (more) => fakeLogger({ ...bindings, ...more }, calls),
  };
}

/** One-connection pool: TEMP tables live in a session, so every query must share it. */
function singleConnectionDb() {
  return createDb(testConfig({ PG_POOL_MAX: '1' }), fakeLogger());
}

/** Mounts any Express app on an ephemeral loopback port; returns { url, close }. */
async function listen(app) {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** The real app on a real port, with optional config, db and logger replacements. */
async function startApp({ config = testConfig(), db, logger = fakeLogger() } = {}) {
  const ownDb = db ?? createDb(config, logger);
  const app = createApp({ config, db: ownDb, logger });
  const server = await listen(app);
  return {
    app,
    logger,
    url: server.url,
    async close() {
      await server.close();
      if (!db) await ownDb.close();
    },
  };
}

module.exports = { testConfig, fakeLogger, singleConnectionDb, listen, startApp };
