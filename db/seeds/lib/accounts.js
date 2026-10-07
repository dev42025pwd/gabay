// The six local test accounts (L119): created in the Firebase Auth emulator through its
// Identity Toolkit REST surface, then mapped to AppUser / UserRole / ShopperAccount (E-08).
// Emulator only: the base URL is the local emulator, and the project is a demo- project.
'use strict';

const { insert } = require('./db');

const EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const BASE = `http://${EMULATOR}/identitytoolkit.googleapis.com/v1`;
const KEY = 'emulator-only'; // the emulator accepts any API key

// roles: [role, tenant | null]. A user's tenants are their UserRole rows (schema 0.14, L121).
const ACCOUNTS = [
  { email: 'superadmin@gabay.test', name: 'Test SuperAdmin', pw: 'SEED_PW_SUPERADMIN', roles: [['SUPERADMIN', null]] },
  { email: 'malladmin@gabay.test', name: 'Test Mall Admin (product owner)', pw: 'SEED_PW_MALLADMIN', roles: [['MALL_ADMIN', 'DEMO_MALLS'], ['MALL_ADMIN', 'SPIKE_VENUES']] },
  { email: 'editor@gabay.test', name: 'Test Venue Editor', pw: 'SEED_PW_EDITOR', roles: [['VENUE_EDITOR', 'DEMO_MALLS'], ['VENUE_EDITOR', 'SPIKE_VENUES']] },
  { email: 'viewer@gabay.test', name: 'Test Viewer', pw: 'SEED_PW_VIEWER', roles: [['VIEWER', 'DEMO_MALLS'], ['VIEWER', 'SPIKE_VENUES']] },
  { email: 'malladmin.demo@gabay.test', name: 'Test Mall Admin (Demo Malls only)', pw: 'SEED_PW_MALLADMIN_DEMO', roles: [['MALL_ADMIN', 'DEMO_MALLS']] },
];
const SHOPPER = { email: 'shopper@gabay.test', name: 'Test Shopper', pw: 'SEED_PW_SHOPPER' };

async function call(path, body) {
  const res = await fetch(`${BASE}/${path}?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json();
  return { ok: res.ok, json };
}

/** Creates the emulator user, or signs in if it exists; returns its UID. */
async function emulatorUser(email, envKey, displayName) {
  const password = process.env[envKey];
  if (!password || password.length < 6) throw new Error(`${envKey} is empty or under 6 characters in .env`);
  const created = await call('accounts:signUp', { email, password, displayName, returnSecureToken: true });
  if (created.ok) return created.json.localId;
  if (created.json.error?.message !== 'EMAIL_EXISTS') throw new Error(`Auth emulator: ${email}: ${created.json.error?.message}`);
  const signedIn = await call('accounts:signInWithPassword', { email, password, returnSecureToken: true });
  if (!signedIn.ok) throw new Error(`Auth emulator: ${email} exists with another password; clear db/seeds/.emulator-data or fix .env`);
  return signedIn.json.localId;
}

async function seedAccounts(client, ids, tenants, venuesByTenant) {
  const summary = [];
  for (const a of ACCOUNTS) {
    const uid = await emulatorUser(a.email, a.pw, a.name);
    const userId = await insert(client, 'AppUser', { FirebaseUid: uid, Email: a.email, DisplayName: a.name }, 'UserId');
    for (const [role, tenant] of a.roles) {
      await insert(client, 'UserRole', { UserId: userId, RoleId: ids.Role[role], TenantId: tenant ? tenants[tenant] : null }, 'UserRoleId');
      if (!tenant) continue;
      for (const venueId of venuesByTenant[tenant]) {
        await client.query(
          'INSERT INTO gabay.UserVenueGrant (TenantId, UserId, VenueId) VALUES ($1, $2, $3) ON CONFLICT (UserId, VenueId) DO NOTHING',
          [tenants[tenant], userId, venueId],
        );
      }
    }
    summary.push(`${a.email}: ${a.roles.map(([r, t]) => (t ? `${r}@${t}` : r)).join(', ')}`);
  }
  const uid = await emulatorUser(SHOPPER.email, SHOPPER.pw, SHOPPER.name);
  await insert(client, 'ShopperAccount', { FirebaseUid: uid, Email: SHOPPER.email, AuthProvider: 'password', DisplayName: SHOPPER.name }, 'ShopperAccountId');
  summary.push(`${SHOPPER.email}: shopper (ShopperAccount)`);
  return summary;
}

const SEED_EMAILS = [...ACCOUNTS.map((a) => a.email), SHOPPER.email];

module.exports = { seedAccounts, SEED_EMAILS };
