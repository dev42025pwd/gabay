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

/** An app whose only route runs one query on a db built from the env overrides. */
async function mountWithDb(overrides, { holdConnection = false } = {}) {
  const logger = fakeLogger();
  const db = createDb(testConfig(overrides), logger);
  const held = holdConnection ? await db.pool.connect() : null;
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
  const s = await mountWithDb(
    { PG_POOL_MAX: '1', PG_CONNECT_TIMEOUT_MS: '300' },
    { holdConnection: true },
  );
  try {
    const r = await get(`${s.url}/q`);
    assert.equal(r.status, 503);
    assert.deepEqual(r.body, UNAVAILABLE);
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

test('db unavailable: a tagged failure is 503; the same errno from a non-database caller is not', async () => {
  const tagged = Object.assign(new Error('connect ECONNREFUSED'), {
    code: 'ECONNREFUSED',
    dbUnavailable: true,
  });
  const other = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
  const s = await mount((app) => {
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
  } finally {
    await s.close();
  }
});
