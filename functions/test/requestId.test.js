// L126: the Blueprint's requestId slot. A sane incoming X-Request-Id is kept, anything else is
// replaced by a generated one, the id is echoed on every response and bound to the request's logger.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb } = require('../src/db');
const { MAX_REQUEST_ID_LENGTH } = require('../src/middleware/requestId');
const { testConfig, fakeLogger, startApp } = require('./helpers');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('requestId: generates a UUID when none is sent, a new one each request', async () => {
  const s = await startApp();
  try {
    const a = (await fetch(`${s.url}/api/health`)).headers.get('x-request-id');
    const b = (await fetch(`${s.url}/api/health`)).headers.get('x-request-id');
    assert.match(a, UUID);
    assert.match(b, UUID);
    assert.notEqual(a, b);
  } finally {
    await s.close();
  }
});

test('requestId: echoes a sane incoming id, on success and on errors', async () => {
  const s = await startApp();
  try {
    const sent = { headers: { 'x-request-id': 'abc-123_X.y' } };
    assert.equal(
      (await fetch(`${s.url}/api/health`, sent)).headers.get('x-request-id'),
      'abc-123_X.y',
    );
    const missing = await fetch(`${s.url}/api/missing`, sent);
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get('x-request-id'), 'abc-123_X.y');
    const longest = 'a'.repeat(MAX_REQUEST_ID_LENGTH);
    const edge = await fetch(`${s.url}/api/health`, { headers: { 'x-request-id': longest } });
    assert.equal(edge.headers.get('x-request-id'), longest, 'the cap itself is allowed');
  } finally {
    await s.close();
  }
});

test('requestId: a malformed incoming id is replaced, never echoed', async () => {
  const s = await startApp();
  try {
    const bad = [
      'has spaces',
      '<script>alert(1)</script>',
      'a/b?c=d',
      'x'.repeat(MAX_REQUEST_ID_LENGTH + 1),
      'café',
    ];
    for (const id of bad) {
      const res = await fetch(`${s.url}/api/health`, { headers: { 'x-request-id': id } });
      const got = res.headers.get('x-request-id');
      assert.notEqual(got, id, `echoed ${id}`);
      assert.match(got, UUID, `replacement for ${id}`);
    }
  } finally {
    await s.close();
  }
});

test('requestId: the id is bound to the request logger (health failure log carries it)', async () => {
  const config = testConfig({ PGPORT: '1', PG_CONNECT_TIMEOUT_MS: '2000' });
  const logger = fakeLogger();
  const db = createDb(config, logger);
  const s = await startApp({ config, db, logger });
  try {
    const res = await fetch(`${s.url}/api/health`, { headers: { 'x-request-id': 'trace-me-1' } });
    assert.equal(res.status, 503);
    assert.equal(logger.calls.error.length, 1);
    assert.equal(logger.calls.error[0][0].reqId, 'trace-me-1');
  } finally {
    await s.close();
    await db.close();
  }
});
