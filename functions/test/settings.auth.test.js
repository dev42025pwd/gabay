'use strict';

// P2-S1: the setting the token-age check reads. Blueprint invariant 16: a key must be listed in DEFAULTS before it
// is used. The default is a DESIGN CHOICE (the Blueprint names the setting but gives no value): 3600 s, the
// lifetime Firebase gives every ID token, so the setting can only make the limit tighter, never looser.

const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS, PUBLIC_FLAGS, createSettings } = require('../src/config/settings');
const { fakeLogger } = require('./helpers');

test('settings: auth.idTokenMaxAgeS is a known key with a default of 3600 seconds', () => {
  assert.equal(DEFAULTS['auth.idTokenMaxAgeS'], 3600);
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
  assert.equal(await bad.getSetting('auth.idTokenMaxAgeS', null), 3600);
});
