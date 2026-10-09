'use strict';

// P2-S1: the UID -> user lookup (db/schema.sql: AppUser.FirebaseUid, ShopperAccount.FirebaseUid, each UNIQUE).
// The real SQL against the real tables, inside a transaction that is always rolled back (authHelpers.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const { createIdentityStore } = require('../src/auth/identityStore');
const { openRolledBackDb, createSeeder } = require('./authHelpers');

async function withStore(fn) {
  const t = await openRolledBackDb();
  try {
    const seed = createSeeder(t.db);
    await fn({ store: createIdentityStore(t.db), seed, db: t.db });
  } finally {
    await t.close();
  }
}

test('identityStore: an AppUser is found by its Firebase UID, with the fields req.user needs', async () => {
  await withStore(async ({ store, seed }) => {
    const user = await seed.user({ name: 'Ann Admin' });
    assert.deepEqual(await store.findByFirebaseUid(user.uid), {
      kind: 'admin',
      userId: user.userId,
      email: user.email,
      displayName: 'Ann Admin',
      isActive: true,
    });
  });
});

test('identityStore: an inactive AppUser is still found, flagged isActive false (the middleware refuses it)', async () => {
  await withStore(async ({ store, seed }) => {
    const user = await seed.user({ isActive: false });
    const found = await store.findByFirebaseUid(user.uid);
    assert.equal(found.kind, 'admin');
    assert.equal(found.isActive, false);
  });
});

test('identityStore: a ShopperAccount is found when no AppUser has the UID (Q12)', async () => {
  await withStore(async ({ store, seed }) => {
    const shopper = await seed.shopper();
    assert.deepEqual(await store.findByFirebaseUid(shopper.uid), {
      kind: 'shopper',
      shopperAccountId: shopper.shopperAccountId,
      email: shopper.email,
      displayName: 'Test Shopper',
    });
  });
});

test('identityStore: an unknown UID is null', async () => {
  await withStore(async ({ store }) => {
    assert.equal(await store.findByFirebaseUid('no-such-uid'), null);
  });
});

test('identityStore: a UID that is not a plain non-empty string is null without touching the database', async () => {
  const calls = [];
  const store = createIdentityStore({ query: async (...args) => calls.push(args) });
  for (const bad of [undefined, null, '', 42, {}, ['a'], 'x'.repeat(129)]) {
    assert.equal(await store.findByFirebaseUid(bad), null, String(bad));
  }
  assert.deepEqual(calls, []);
});

test('identityStore: the UID is a bound parameter; SQL in it matches nothing (rule 3)', async () => {
  await withStore(async ({ store, seed }) => {
    await seed.user();
    assert.equal(await store.findByFirebaseUid("x' OR '1'='1"), null);
    assert.equal(await store.findByFirebaseUid("x'; DROP TABLE gabay.AppUser; --"), null);
    assert.equal(await store.findByFirebaseUid('%'), null, 'no LIKE matching');
  });
});

test('identityStore: a database error is not swallowed (the middleware turns it into 503 or 500)', async () => {
  const boom = new Error('terminated');
  const store = createIdentityStore({
    query: async () => {
      throw boom;
    },
  });
  await assert.rejects(store.findByFirebaseUid('uid'), (err) => err === boom);
});
