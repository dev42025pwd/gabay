'use strict';

// P2-S1: the two Firebase keys the token check reads (FIREBASE_PROJECT_ID, FIREBASE_AUTH_EMULATOR_HOST).
// The one rule that matters: an emulator host in production would make the Admin SDK accept unsigned
// tokens, so production refuses to start with one.

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseConfig, ConfigError } = require('../src/config');

const BASE = { PGHOST: 'h', PGDATABASE: 'd', PGUSER: 'u', PGPASSWORD: 'p' };

test('config.firebase: both keys are optional and default to nothing', () => {
  const c = parseConfig(BASE);
  assert.equal(c.firebase.projectId, null);
  assert.equal(c.firebase.authEmulatorHost, null);
  assert.ok(Object.isFrozen(c.firebase));
});

test('config.firebase: an emulator host with no project ID uses the emulator project demo-gabay', () => {
  const c = parseConfig({ ...BASE, FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' });
  assert.equal(c.firebase.authEmulatorHost, '127.0.0.1:9099');
  assert.equal(c.firebase.projectId, 'demo-gabay');
});

test('config.firebase: an explicit project ID wins over the emulator default', () => {
  const c = parseConfig({
    ...BASE,
    FIREBASE_PROJECT_ID: 'my-project',
    FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099',
  });
  assert.equal(c.firebase.projectId, 'my-project');
});

test('config.firebase: empty values count as unset', () => {
  const c = parseConfig({ ...BASE, FIREBASE_PROJECT_ID: '', FIREBASE_AUTH_EMULATOR_HOST: '' });
  assert.equal(c.firebase.projectId, null);
  assert.equal(c.firebase.authEmulatorHost, null);
});

test('config.firebase: production with an emulator host is refused, naming the key', () => {
  assert.throws(
    () =>
      parseConfig({
        ...BASE,
        NODE_ENV: 'production',
        FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      }),
    (err) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /FIREBASE_AUTH_EMULATOR_HOST/);
      return true;
    },
  );
});

test('config.firebase: production with a real project ID and no emulator is accepted', () => {
  const c = parseConfig({ ...BASE, NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'gabay-prod' });
  assert.equal(c.firebase.projectId, 'gabay-prod');
  assert.equal(c.firebase.authEmulatorHost, null);
});

test('config.firebase: a malformed emulator host is refused', () => {
  for (const bad of ['no-port', 'http://127.0.0.1:9099', '127.0.0.1:99999x', 'a b:9099']) {
    assert.throws(
      () => parseConfig({ ...BASE, FIREBASE_AUTH_EMULATOR_HOST: bad }),
      /FIREBASE_AUTH_EMULATOR_HOST/,
      bad,
    );
  }
});
