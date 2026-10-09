'use strict';

// FF-0 (E-20): the development stub loads its one admin by email through S1's identity store (findAdminByEmail).
// Kept in its own file so S1's identityStore tests stay untouched. Real SQL, real tables, a transaction that is always
// rolled back (authHelpers.js). R1 deletes the stub; this method goes with it unless something else uses it.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createIdentityStore } = require('../src/auth/identityStore');
const { openRolledBackDb, createSeeder } = require('./authHelpers');

async function withStore(fn) {
  const t = await openRolledBackDb();
  try {
    await fn({ store: createIdentityStore(t.db), seed: createSeeder(t.db) });
  } finally {
    await t.close();
  }
}

test('identityStore.findAdminByEmail: finds an AppUser by email, any letter case, with the UID lookup fields plus the Firebase UID', async () => {
  await withStore(async ({ store, seed }) => {
    const user = await seed.user({ name: 'Ann Admin' });
    const expected = {
      kind: 'admin',
      userId: user.userId,
      email: user.email,
      displayName: 'Ann Admin',
      isActive: true,
      firebaseUid: user.uid,
    };
    assert.deepEqual(await store.findAdminByEmail(user.email), expected);
    assert.deepEqual(await store.findAdminByEmail(user.email.toUpperCase()), expected);
  });
});

test('identityStore.findAdminByEmail: an inactive user is still found, flagged isActive false', async () => {
  await withStore(async ({ store, seed }) => {
    const user = await seed.user({ isActive: false });
    assert.equal((await store.findAdminByEmail(user.email)).isActive, false);
  });
});

test('identityStore.findAdminByEmail: an unknown email, a shopper email and a non-string are null', async () => {
  await withStore(async ({ store, seed }) => {
    const shopper = await seed.shopper();
    assert.equal(await store.findAdminByEmail('nobody@gabay.test'), null);
    assert.equal(await store.findAdminByEmail(shopper.email), null, 'a shopper is not an admin');
    assert.equal(await store.findAdminByEmail(''), null);
    assert.equal(await store.findAdminByEmail(undefined), null);
  });
});
