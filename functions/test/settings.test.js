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

// Regression: S2 re-review N2. A tenant id given as a string ("5", as the X-Tenant-Id header will
// deliver it in Phase 2) silently dropped the tenant's overrides and split the cache key.
test('settings: a tenant id given as a string "5" is the same tenant as 5 (values and cache)', async () => {
  const db = fakeDb([row(null, 'routing.stairsSaveM', '200'), row(5, 'routing.stairsSaveM', '90')]);
  const s = createSettings(db.query, fakeLogger());
  assert.equal(await s.getSetting('routing.stairsSaveM', 5), 90);
  assert.equal(
    await s.getSetting('routing.stairsSaveM', '5'),
    90,
    'the string finds the overrides',
  );
  assert.equal(await s.getSetting('routing.stairsSaveM', ' 5 '), 90, 'surrounding spaces are fine');
  assert.equal(db.state.calls.length, 1, 'one cache entry, not one per spelling');
  assert.deepEqual(db.state.calls[0], [5], 'a number is what is bound');
  assert.deepEqual((await s.getPublicFlags('5'))['liveStatus.overlay'], false);
  assert.equal(db.state.calls.length, 1);
  // invalidate takes either spelling.
  db.state.rows = [row(5, 'routing.stairsSaveM', '55')];
  s.invalidate('5');
  assert.equal(await s.getSetting('routing.stairsSaveM', 5), 55);
});

test('settings: a garbage tenant id never throws, falls back to the platform values and warns', async () => {
  const db = fakeDb([row(null, 'routing.stairsSaveM', '200'), row(5, 'routing.stairsSaveM', '90')]);
  const logger = fakeLogger();
  const s = createSettings(db.query, logger);
  // Includes values that cannot be turned into a string (S2 final nit): describing the bad id in the
  // warning must never throw either.
  const noPrototype = Object.create(null);
  const hostile = {
    toString() {
      throw new Error('toString exploded');
    },
  };
  const bads = ['abc', '5; DROP TABLE x', '1.5', 1.5, -3, 0, '', NaN, {}, [5], true];
  bads.push(noPrototype, hostile, Symbol('tenant'), 5n, () => 5);
  for (const [i, bad] of bads.entries()) {
    assert.equal(await s.getSetting('routing.stairsSaveM', bad), 200, `getSetting #${i}`);
    assert.doesNotThrow(() => s.invalidate(bad), `invalidate #${i}`);
    assert.deepEqual(
      await s.getPublicFlags(bad),
      { 'analytics.routeTraces': false, 'liveStatus.overlay': false },
      `getPublicFlags #${i}`,
    );
  }
  assert.deepEqual(await s.getPublicFlags('abc'), {
    'analytics.routeTraces': false,
    'liveStatus.overlay': false,
  });
  assert.ok(logger.calls.warn.length >= bads.length * 3, 'each garbage id is logged');
  // The platform query, never a tenant query, ran for them: the bound value is null.
  assert.ok(db.state.calls.every((p) => p[0] === null));
});
