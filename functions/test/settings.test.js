'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS, PUBLIC_FLAGS, CACHE_TTL_MS, createSettings } = require('../src/config/settings');
const { singleConnectionDb, fakeLogger } = require('./helpers');

/** pg returns column names in lower case (identifiers are never quoted in this schema). */
const row = (tenantid, settingkey, settingvalue) => ({ tenantid, settingkey, settingvalue });

function fakeDb(rows) {
  const state = { calls: [], rows, fail: false };
  const query = async (text, params) => {
    state.calls.push(params);
    if (state.fail) throw new Error('connection terminated');
    return { rows: state.rows };
  };
  return { state, query };
}

test('settings: DEFAULTS is frozen and every public flag is a known default', () => {
  assert.ok(Object.isFrozen(DEFAULTS));
  assert.ok(Object.isFrozen(PUBLIC_FLAGS));
  for (const key of PUBLIC_FLAGS) assert.ok(Object.hasOwn(DEFAULTS, key), key);
  assert.equal(DEFAULTS['analytics.routeTraces'], false, 'module gates fail closed');
});

test('settings: when the database throws, every resolver returns its default and never throws', async () => {
  const db = fakeDb([]);
  db.state.fail = true;
  const logger = fakeLogger();
  const s = createSettings(db.query, logger);

  assert.equal(await s.getSetting('routing.stairsSaveM'), 144);
  assert.equal(await s.getSetting('analytics.routeTraces', 7), false);
  assert.equal(await s.getSetting('not.a.key'), undefined);
  assert.deepEqual(await s.getPublicFlags(), {
    'analytics.routeTraces': false,
    'liveStatus.overlay': false,
  });
  assert.deepEqual(await s.getPublicConfig(), {}, 'the pre-auth config is {} on error');
  assert.ok(logger.calls.warn.length >= 3, 'each failure is logged');
});

test('settings: a tenant override beats the platform row, and values parse to the default type', async () => {
  const db = fakeDb([
    row(null, 'routing.stairsSaveM', '200'),
    row(null, 'analytics.routeTraces', 'off'),
    row(null, 'calibration.maxPlaceM', 'not-a-number'),
    row(null, 'unknown.key', 'x'),
    row(5, 'routing.stairsSaveM', '90'),
    row(5, 'liveStatus.overlay', 'true'),
  ]);
  const s = createSettings(db.query, fakeLogger());

  assert.equal(await s.getSetting('routing.stairsSaveM', 5), 90);
  assert.equal(await s.getSetting('liveStatus.overlay', 5), true);
  assert.equal(await s.getSetting('analytics.routeTraces', 5), false);
  assert.equal(
    await s.getSetting('calibration.maxPlaceM', 5),
    6,
    'an unparseable value falls back to the default',
  );
  assert.equal(await s.getSetting('unknown.key', 5), undefined, 'only DEFAULTS keys are served');
  assert.deepEqual(db.state.calls[0], [5], 'the tenant id is a bound parameter');
});

test('settings: tenant beats platform whatever order the rows arrive in (regression: S2 review, Important 3)', async () => {
  // The tenant row is deliberately FIRST. Precedence must not depend on the SQL's ORDER BY.
  const db = fakeDb([row(5, 'routing.stairsSaveM', '90'), row(null, 'routing.stairsSaveM', '200')]);
  const s = createSettings(db.query, fakeLogger());
  assert.equal(await s.getSetting('routing.stairsSaveM', 5), 90);
  // Defence in depth (rule 2): another tenant's row is ignored even if one ever slipped through.
  assert.equal(await s.getSetting('routing.stairsSaveM', 6), 200);
  const platform = createSettings(
    fakeDb([row(null, 'routing.stairsSaveM', '200')]).query,
    fakeLogger(),
  );
  assert.equal(await platform.getSetting('routing.stairsSaveM'), 200);
});

test('settings: cached for 30 s, then re-read; invalidate() forces a re-read now', async () => {
  let clock = 1_000;
  const db = fakeDb([row(null, 'routing.stairsSaveM', '100')]);
  const s = createSettings(db.query, fakeLogger(), () => clock);

  assert.equal(await s.getSetting('routing.stairsSaveM'), 100);
  assert.equal(await s.getSetting('liveStatus.overlay'), false);
  assert.equal(db.state.calls.length, 1, 'one read serves both');

  db.state.rows = [row(null, 'routing.stairsSaveM', '111')];
  clock += CACHE_TTL_MS - 1;
  assert.equal(await s.getSetting('routing.stairsSaveM'), 100, 'still cached');
  clock += 1;
  assert.equal(await s.getSetting('routing.stairsSaveM'), 111, 'expired, re-read');

  db.state.rows = [row(null, 'routing.stairsSaveM', '222')];
  assert.equal(await s.getSetting('routing.stairsSaveM'), 111);
  s.invalidate();
  assert.equal(await s.getSetting('routing.stairsSaveM'), 222, 'invalidated on write');
});

test('settings: the query runs against the real gabay.GlobalSetting columns (read only)', async () => {
  // The resolver swallows errors by design, so a wrong column name would hide behind the default.
  // This test wraps the query to prove the SQL itself is valid against the signed schema.
  const db = singleConnectionDb();
  let failure = null;
  const s = createSettings(async (text, params) => {
    try {
      return await db.query(text, params);
    } catch (err) {
      failure = err;
      throw err;
    }
  }, fakeLogger());
  try {
    const value = await s.getSetting('routing.stairsSaveM');
    assert.equal(failure, null, failure?.message);
    assert.equal(typeof value, 'number');
    assert.deepEqual(Object.keys(await s.getPublicConfig()).sort(), [...PUBLIC_FLAGS].sort());
  } finally {
    await db.close();
  }
});
