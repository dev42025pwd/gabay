'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb } = require('../src/db');
const { testConfig, fakeLogger, startApp } = require('./helpers');

test('app: the middleware stack is in the standard order (§3.1)', async () => {
  const s = await startApp();
  try {
    const names = s.app.router.stack.map((layer) => layer.name);
    assert.deepEqual(names, [
      'helmetMiddleware',
      'corsMiddleware',
      'jsonParser',
      'auditLoggerSlot',
      'apiNoStore',
      'rateLimiterSlot',
      'router', // the /api routes
      'notFound',
      'errorHandler',
    ]);
  } finally {
    await s.close();
  }
});

test('app: trust proxy is a hop count from env, and x-powered-by is off', async () => {
  const one = await startApp();
  const three = await startApp({ config: testConfig({ TRUST_PROXY_HOPS: '3' }) });
  try {
    assert.equal(one.app.get('trust proxy'), 1);
    assert.equal(three.app.get('trust proxy'), 3);
    const res = await fetch(`${one.url}/api/health`);
    assert.equal(res.headers.get('x-powered-by'), null);
  } finally {
    await one.close();
    await three.close();
  }
});

test('app: helmet headers are present and /api answers are no-store', async () => {
  const s = await startApp();
  try {
    const res = await fetch(`${s.url}/api/health`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(res.headers.get('strict-transport-security'));
    assert.equal(res.headers.get('cache-control'), 'no-store');
    // The 404 under /api is no-store too; a path outside /api is not.
    assert.equal((await fetch(`${s.url}/api/missing`)).headers.get('cache-control'), 'no-store');
    assert.notEqual((await fetch(`${s.url}/missing`)).headers.get('cache-control'), 'no-store');
  } finally {
    await s.close();
  }
});

test('app: an unknown route is the standard 404 shape', async () => {
  const s = await startApp();
  try {
    const res = await fetch(`${s.url}/api/does-not-exist`);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'Not found' });
  } finally {
    await s.close();
  }
});

test('app: a JSON body over MAX_JSON_BODY is 413 in the { error } shape', async () => {
  const s = await startApp({ config: testConfig({ MAX_JSON_BODY: '1kb' }) });
  try {
    const res = await fetch(`${s.url}/api/health`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filler: 'x'.repeat(4096) }),
    });
    assert.equal(res.status, 413);
    assert.deepEqual(await res.json(), { error: 'Request body too large' });
  } finally {
    await s.close();
  }
});

test('app: malformed JSON is 400 in the { error } shape, without the parser text', async () => {
  const s = await startApp();
  try {
    const res = await fetch(`${s.url}/api/health`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"broken": ',
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'Malformed JSON body' });
  } finally {
    await s.close();
  }
});

test('app: CORS allows a listed origin, not an unlisted one, and warns when the list is empty', async () => {
  const listed = await startApp({ config: testConfig({ CORS_ORIGINS: 'http://admin.test' }) });
  const open = await startApp({ config: testConfig({ CORS_ORIGINS: ' ' }) });
  try {
    const ok = await fetch(`${listed.url}/api/health`, {
      headers: { origin: 'http://admin.test' },
    });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'http://admin.test');
    const no = await fetch(`${listed.url}/api/health`, { headers: { origin: 'http://evil.test' } });
    assert.equal(no.headers.get('access-control-allow-origin'), null);
    assert.equal(listed.logger.calls.warn.length, 0);

    assert.equal(open.logger.calls.warn.length, 1, 'the permissive fallback is announced');
    assert.match(String(open.logger.calls.warn[0][0]), /CORS_ORIGINS is empty/);
  } finally {
    await listed.close();
    await open.close();
  }
});

test('health: 200 { status, db } with the local database', async () => {
  const s = await startApp();
  try {
    const res = await fetch(`${s.url}/api/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok', db: 'ok' });
  } finally {
    await s.close();
  }
});

test('health: 503 { error } and a log line when the database is unreachable', async () => {
  // Port 1 refuses connections at once: no waiting on a timeout.
  const config = testConfig({ PGPORT: '1', PG_CONNECT_TIMEOUT_MS: '2000' });
  const logger = fakeLogger();
  const db = createDb(config, logger);
  const s = await startApp({ config, db, logger });
  try {
    const res = await fetch(`${s.url}/api/health`);
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: 'Database unavailable' });
    assert.equal(logger.calls.error.length, 1);
  } finally {
    await s.close();
    await db.close();
  }
});
