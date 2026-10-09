'use strict';

// P2-S1: the setting the token-age check reads. Blueprint invariant 16: a key must be listed in DEFAULTS before it
// is used. The owner ruled (P2-S1 review, I3): the setting is the time since sign-in (now minus auth_time), default
// 28800 s (8 h, the session length of standard §3.3).

const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS, PUBLIC_FLAGS, createSettings } = require('../src/config/settings');
const { fakeLogger } = require('./helpers');

test('settings: auth.idTokenMaxAgeS is a known key with a default of 28800 seconds', () => {
  assert.equal(DEFAULTS['auth.idTokenMaxAgeS'], 28800);
  assert.equal(typeof DEFAULTS['auth.idTokenMaxAgeS'], 'number');
});

test('settings: auth.idTokenMaxAgeS is not a public flag (a client has no business reading it before sign-in)', () => {
  assert.ok(!PUBLIC_FLAGS.includes('auth.idTokenMaxAgeS'));
});

test('settings: a platform row for auth.idTokenMaxAgeS is read as a number, and text that is not a number gives the default', async () => {
  const rows = (value) => ({
    rows: [{ tenantid: null, settingkey: 'auth.idTokenMaxAgeS', settingvalue: value }],
  });
  const good = createSettings(async () => rows('900'), fakeLogger());
  assert.equal(await good.getSetting('auth.idTokenMaxAgeS', null), 900);
  const bad = createSettings(async () => rows('about an hour'), fakeLogger());
  assert.equal(await bad.getSetting('auth.idTokenMaxAgeS', null), 28800);
});
