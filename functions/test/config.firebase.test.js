'use strict';

// P2-S1: the two Firebase keys the token check reads (FIREBASE_PROJECT_ID, FIREBASE_AUTH_EMULATOR_HOST).
// The one rule that matters (owner's ruling I1): an emulator host makes the Admin SDK accept unsigned tokens, so it is
// refused unless the RAW environment says NODE_ENV=development or NODE_ENV=test. An unset NODE_ENV does not count: it
// defaults to development in zod, and a deployed function that forgot NODE_ENV must not be treated as a dev machine.

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseConfig, ConfigError } = require('../src/config');

const BASE = { PGHOST: 'h', PGDATABASE: 'd', PGUSER: 'u', PGPASSWORD: 'p' };
const DEV = { ...BASE, NODE_ENV: 'development' };

test('config.firebase: both keys are optional and default to nothing', () => {
  const c = parseConfig(BASE);
  assert.equal(c.firebase.projectId, null);
  assert.equal(c.firebase.authEmulatorHost, null);
  assert.ok(Object.isFrozen(c.firebase));
});

test('config.firebase: an emulator host with no project ID uses the emulator project demo-gabay', () => {
  const c = parseConfig({ ...DEV, FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' });
  assert.equal(c.firebase.authEmulatorHost, '127.0.0.1:9099');
  assert.equal(c.firebase.projectId, 'demo-gabay');
});

test('config.firebase: an explicit project ID wins over the emulator default', () => {
  const c = parseConfig({
    ...DEV,
    FIREBASE_PROJECT_ID: 'my-project',
    FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099',
  });
  assert.equal(c.firebase.projectId, 'my-project');
});

test('config.firebase: empty values count as unset', () => {
  const c = parseConfig({ ...DEV, FIREBASE_PROJECT_ID: '', FIREBASE_AUTH_EMULATOR_HOST: '' });
  assert.equal(c.firebase.projectId, null);
  assert.equal(c.firebase.authEmulatorHost, null);
});

test('config.firebase: an emulator host is accepted only with NODE_ENV=development or NODE_ENV=test', () => {
  for (const env of ['development', 'test']) {
    const c = parseConfig({
      ...BASE,
      NODE_ENV: env,
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    });
    assert.equal(c.firebase.authEmulatorHost, '127.0.0.1:9099', env);
  }
});

test('config.firebase: an emulator host is refused in production, with NODE_ENV unset, and with NODE_ENV empty', () => {
  const cases = {
    production: { ...BASE, NODE_ENV: 'production' },
    unset: { ...BASE },
    empty: { ...BASE, NODE_ENV: '' }, // an empty value counts as unset everywhere in this config
  };
  for (const [name, env] of Object.entries(cases)) {
    assert.throws(
      () => parseConfig({ ...env, FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }),
      (err) => {
        assert.ok(err instanceof ConfigError, name);
        assert.match(err.message, /FIREBASE_AUTH_EMULATOR_HOST/, name);
        assert.match(err.message, /NODE_ENV/, name);
        return true;
      },
      name,
    );
  }
});

test('config.firebase: no emulator host and NODE_ENV unset is fine (the usual deployed shape)', () => {
  const c = parseConfig({ ...BASE, FIREBASE_PROJECT_ID: 'gabay-prod' });
  assert.equal(c.firebase.authEmulatorHost, null);
});

test('config.firebase: production with a real project ID and no emulator is accepted', () => {
  const c = parseConfig({ ...BASE, NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'gabay-prod' });
  assert.equal(c.firebase.projectId, 'gabay-prod');
  assert.equal(c.firebase.authEmulatorHost, null);
});

test('config.firebase: a malformed emulator host is refused', () => {
  for (const bad of ['no-port', 'http://127.0.0.1:9099', '127.0.0.1:99999x', 'a b:9099']) {
    assert.throws(
      () => parseConfig({ ...DEV, FIREBASE_AUTH_EMULATOR_HOST: bad }),
      /FIREBASE_AUTH_EMULATOR_HOST/,
      bad,
    );
  }
});
