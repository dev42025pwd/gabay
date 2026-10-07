'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseConfig, ConfigError } = require('../src/config');

const BASE = { PGHOST: 'h', PGDATABASE: 'd', PGUSER: 'u', PGPASSWORD: 'p' };

test('config: valid env gives defaults for everything optional', () => {
  const c = parseConfig(BASE);
  assert.equal(c.env, 'development');
  assert.equal(c.db.port, 5432);
  assert.equal(c.trustProxyHops, 1);
  assert.equal(c.maxJsonBody, '5mb');
  assert.deepEqual([...c.corsOrigins], []);
  assert.equal(c.db.statementTimeoutMs, 60_000);
});

test('config: missing required keys fail fast, naming each key and never the values', () => {
  assert.throws(
    () => parseConfig({ PGHOST: 'h', PGPASSWORD: 'secret-value' }),
    (err) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /PGDATABASE/);
      assert.match(err.message, /PGUSER/);
      assert.doesNotMatch(err.message, /secret-value/);
      return true;
    },
  );
});

test('config: an empty value counts as unset (required key fails, optional takes its default)', () => {
  assert.throws(() => parseConfig({ ...BASE, PGPASSWORD: '' }), /PGPASSWORD/);
  assert.equal(parseConfig({ ...BASE, PGPORT: '' }).db.port, 5432);
});

test('config: malformed values are refused', () => {
  assert.throws(() => parseConfig({ ...BASE, PGPORT: 'abc' }), /PGPORT/);
  assert.throws(() => parseConfig({ ...BASE, MAX_JSON_BODY: '50 megabytes' }), /MAX_JSON_BODY/);
  assert.throws(() => parseConfig({ ...BASE, NODE_ENV: 'staging' }), /NODE_ENV/);
});

test('config: CORS_ORIGINS is split and trimmed, TRUST_PROXY_HOPS is read as a number', () => {
  const c = parseConfig({
    ...BASE,
    CORS_ORIGINS: ' http://a.test , http://b.test ,',
    TRUST_PROXY_HOPS: '2',
  });
  assert.deepEqual([...c.corsOrigins], ['http://a.test', 'http://b.test']);
  assert.equal(c.trustProxyHops, 2);
});
