// Regression: S2 review, Important 2. Only /api/health answered 503 when the database was down;
// every other route answered a generic 500. A connection-level failure is now 503 on every route.
// Each case below uses a REAL failure from pg on a throwaway route, not a hand-built error.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createErrorHandler, notFound } = require('../src/utils/errors');
const { createDb } = require('../src/db');
const { fakeLogger, singleConnectionDb, testConfig, listen } = require('./helpers');

const UNAVAILABLE = { error: 'Database unavailable' };

/** A tiny app with the real error tail and the given routes. */
async function mount(routes, logger = fakeLogger()) {
  const app = express();
  routes(app);
  app.use(notFound);
  app.use(createErrorHandler(logger));
  return { ...(await listen(app)), logger };
}

async function get(url) {
  const res = await fetch(url);
  return { status: res.status, body: await res.json() };
}

/**
 * An app whose only route runs one query on a db built from the env overrides.
 * holdConnection: take a connection out of the pool before the request, so the pool is full.
 * requestTimeoutMs: the pool's connection limit WHILE the request runs. The held connection is opened under the
 * configured limit (S7 round 3: pg-pool uses connectionTimeoutMillis both for waiting for a free connection and
 * for logging in on a new one, so a 300 ms limit also cut the setup's own login short on a busy machine); only
 * then is the limit lowered, so only the request being tested waits under it.
 */
async function mountWithDb(overrides, { holdConnection = false, requestTimeoutMs = null } = {}) {
  const logger = fakeLogger();
  const db = createDb(testConfig(overrides), logger);
  const held = holdConnection ? await db.pool.connect() : null;
  // pg-pool reads options.connectionTimeoutMillis each time a connection is asked for.
  if (requestTimeoutMs !== null) db.pool.options.connectionTimeoutMillis = requestTimeoutMs;
  const s = await mount(
    (app) =>
      app.get('/q', async () => {
        await db.query('SELECT 1', []);
      }),
    logger,
  );
  return {
    ...s,
    async close() {
      held?.release();
      await s.close();
      await db.close();
    },
  };
}

test('db unavailable: connection refused (a bad db port) on any route is 503, logged, no driver text', async () => {
  const s = await mountWithDb({ PGPORT: '1', PG_CONNECT_TIMEOUT_MS: '2000' });
  try {
    const r = await get(`${s.url}/q`);
    assert.equal(r.status, 503);
    assert.deepEqual(r.body, UNAVAILABLE);
    assert.equal(s.logger.calls.error.length, 1, 'logged server-side');
  } finally {
    await s.close();
  }
});

test('db unavailable: an unknown database host (ENOTFOUND) is 503', async () => {
  const s = await mountWithDb({ PGHOST: 'no-such-host.invalid', PG_CONNECT_TIMEOUT_MS: '5000' });
  try {
    const r = await get(`${s.url}/q`);
    assert.equal(r.status, 503);
    assert.deepEqual(r.body, UNAVAILABLE);
  } finally {
    await s.close();
  }
});

test('db unavailable: a pool that cannot hand out a connection in time ("timeout exceeded") is 503', async () => {
  // The login of the held connection gets a generous limit (it is setup, not the thing under test);
  // the request then waits 300 ms for a connection that never frees up.
  const s = await mountWithDb(
    { PG_POOL_MAX: '1', PG_CONNECT_TIMEOUT_MS: '10000' },
    { holdConnection: true, requestTimeoutMs: 300 },
  );
  try {
    const r = await get(`${s.url}/q`);
    assert.equal(r.status, 503);
    assert.deepEqual(r.body, UNAVAILABLE);
    // The real pg-pool wait-for-a-free-connection path, not a login failure.
    assert.equal(s.logger.calls.error.length, 1, 'logged server-side');
    assert.equal(s.logger.calls.error[0][0].err.message, 'timeout exceeded when trying to connect');
  } finally {
    await s.close();
  }
});

test('db unavailable: the server ending our session (57P01) is 503', async () => {
  const db = singleConnectionDb();
  const s = await mount((app) =>
    app.get('/kill', async () => {
      await db.query('SELECT pg_terminate_backend(pg_backend_pid())', []);
    }),
  );
  try {
    const r = await get(`${s.url}/kill`);
    assert.equal(r.status, 503);
    assert.deepEqual(r.body, UNAVAILABLE);
  } finally {
    await s.close();
    await db.close();
  }
});

test('db unavailable: a tagged failure is 503; the same errno from a non-database caller is not (also inside a transaction)', async () => {
  const tagged = Object.assign(new Error('connect ECONNREFUSED'), {
    code: 'ECONNREFUSED',
    dbUnavailable: true,
  });
  const other = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
  // Regression (S2 re-review N1): the same errno thrown by the caller's own code INSIDE a transaction,
  // for example a future Cloud Storage call, is not the database's fault either.
  const db = singleConnectionDb();
  const s = await mount((app) => {
    app.get('/in-tx', async () => {
      await db.withTransaction(async () => {
        throw other;
      });
    });
    app.get('/tagged', () => {
      throw tagged;
    });
    app.get('/other', () => {
      throw other;
    });
  });
  try {
    assert.deepEqual((await get(`${s.url}/tagged`)).body, UNAVAILABLE);
    const r = await get(`${s.url}/other`);
    assert.equal(
      r.status,
      500,
      'a failure outside the database layer is not blamed on the database',
    );
    assert.deepEqual(r.body, { error: 'Internal server error' });

    const inTx = await get(`${s.url}/in-tx`);
    assert.equal(inTx.status, 500, 'not 503: the database was fine');
    assert.deepEqual(inTx.body, { error: 'Internal server error' });
    assert.equal(other.dbUnavailable, undefined, 'the error thrown by the caller is not tagged');
    assert.equal(
      db.pool.totalCount,
      1,
      'the healthy connection went back to the pool, not destroyed',
    );
    assert.equal(db.pool.idleCount, 1);
  } finally {
    await s.close();
    await db.close();
  }
});
