'use strict';

// P2-S1: GET /api/me through the real app (createApp), the real SQL and a real database, with only the Firebase
// verifier replaced by a test double (dependency injection). Why a double and not the Auth emulator: `npm run
// verify` runs the API tests (check 10) BEFORE the seed starts the emulator (check 12), and the emulator ports are
// shared by every working copy; the real SDK's behaviour is covered separately, in emulator mode, against a fake
// Identity Toolkit (firebaseVerifier.test.js). The database rows are inserted inside a transaction that is always
// rolled back (authHelpers.js), so the test needs no seed and keeps nothing.
//
// No PermissionRoute rows are seeded yet (S3 seeds them), so the merge is tested with rows created here.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { createSettings } = require('../src/config/settings');
const { httpError } = require('../src/utils/errors');
const { testConfig, fakeLogger, listen } = require('./helpers');
const {
  fakeTokenVerifier,
  fakeIdentityToolkit,
  unsignedIdToken,
  loggedText,
  nowSeconds,
  openRolledBackDb,
  createSeeder,
} = require('./authHelpers');

const NOW_MS = 1_800_000_000_000;
const NOW_S = NOW_MS / 1000;
const fresh = (uid) => ({ uid, iat: NOW_S - 60, auth_time: NOW_S - 60 });
const flags = (create, read, update, deleted) => ({ create, read, update, delete: deleted });

/** The app on a port, over a rolled-back transaction; `verify` maps token -> claims for the injected verifier. */
async function withApp(fn, { verify = {}, db: replaceDb, settings } = {}) {
  const t = await openRolledBackDb();
  const db = replaceDb ?? t.db;
  const logger = fakeLogger();
  const tokenVerifier = fakeTokenVerifier(verify);
  const app = createApp({
    config: testConfig(),
    db,
    logger,
    tokenVerifier,
    settings: settings ?? createSettings((text, params) => db.query(text, params), logger),
    now: () => NOW_MS,
  });
  const server = await listen(app);
  const seed = createSeeder(t.db);
  const call = (path, { token, headers = {}, method = 'GET' } = {}) =>
    fetch(`${server.url}${path}`, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    });
  try {
    await fn({ call, seed, db: t.db, tokenVerifier, logger, verify });
  } finally {
    await server.close();
    await t.close();
  }
}

/** Creates an admin whose token is `tok-<uid>`, registers it with the verifier, returns the user. */
async function signedInAdmin({ seed, verify }, options = {}) {
  const user = await seed.user(options);
  verify[`tok-${user.uid}`] = fresh(user.uid);
  return { ...user, token: `tok-${user.uid}` };
}

test('GET /api/me: no token is 401, a bad token is 401, both in the { error } shape', async () => {
  await withApp(async ({ call }) => {
    const none = await call('/api/me');
    assert.equal(none.status, 401);
    assert.deepEqual(await none.json(), { error: 'Authentication required' });
    const bad = await call('/api/me', { token: 'forged' });
    assert.equal(bad.status, 401);
    assert.deepEqual(await bad.json(), { error: 'Invalid session' });
  });
});

test('GET /api/me: a refusal by the verifier alone decides: the same token is 401 while it is refused and 200 once it is not, for an active user', async () => {
  await withApp(async (ctx) => {
    const user = await ctx.seed.user();
    ctx.verify.tok = httpError(401, 'Invalid session'); // what the real verifier throws for a revoked token
    const refused = await ctx.call('/api/me', { token: 'tok' });
    assert.equal(refused.status, 401);
    assert.deepEqual(await refused.json(), { error: 'Invalid session' });
    ctx.verify.tok = fresh(user.uid);
    assert.equal((await ctx.call('/api/me', { token: 'tok' })).status, 200);
  });
});

test('GET /api/me: an inactive user is 401 "Account is not active"', async () => {
  await withApp(async (ctx) => {
    const user = await signedInAdmin(ctx, { isActive: false });
    const res = await ctx.call('/api/me', { token: user.token });
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: 'Account is not active' });
  });
});

test('GET /api/me: a Firebase identity with no Gabay account is 403', async () => {
  await withApp(async (ctx) => {
    ctx.verify.stranger = fresh('uid-nobody-has-this');
    const res = await ctx.call('/api/me', { token: 'stranger' });
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: 'This account has no access' });
  });
});

test('GET /api/me: a shopper account is 403 (admin routes accept only AppUser, Q12)', async () => {
  await withApp(async (ctx) => {
    const shopper = await ctx.seed.shopper();
    ctx.verify.shopper = fresh(shopper.uid);
    const res = await ctx.call('/api/me', { token: 'shopper' });
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: 'This account has no access' });
  });
});

test('GET /api/me: a mall admin of two tenants sees both, with OR-ed role rights and one override replacing a role row', async () => {
  await withApp(async (ctx) => {
    const { seed } = ctx;
    const [tA, tB] = [await seed.tenant('A'), await seed.tenant('B')];
    const [admin, viewer] = [await seed.role('MALL_ADMIN'), await seed.role('VIEWER')];
    const [venues, beacons, audit] = [
      await seed.route('venues'),
      await seed.route('beacons'),
      await seed.route('audit'),
    ];
    await seed.rolePermission(admin, venues, [true, true, true, true]);
    await seed.rolePermission(admin, beacons, [false, true, false, false]);
    await seed.rolePermission(viewer, venues, [false, true, false, false]);
    await seed.rolePermission(viewer, audit, [false, true, false, false]);
    const user = await signedInAdmin(ctx, { name: 'Mia Mall' });
    await seed.userRole(user.userId, admin, tA.tenantId);
    await seed.userRole(user.userId, admin, tB.tenantId);
    await seed.userRole(user.userId, viewer, tB.tenantId);
    await seed.userPermission(user.userId, beacons, [false, false, false, false]); // takes beacons away everywhere

    const res = await ctx.call('/api/me', { token: user.token });
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.deepEqual(body.user, {
      userId: user.userId,
      email: user.email,
      displayName: 'Mia Mall',
    });
    assert.equal(body.isSuperAdmin, false);
    assert.deepEqual(body.platformRoles, []);
    const mine = body.tenants.filter((t) => [tA.tenantId, tB.tenantId].includes(t.tenantId));
    assert.equal(body.tenants.length, 2, 'exactly the tenants of this user');
    const a = mine.find((t) => t.tenantId === tA.tenantId);
    const b = mine.find((t) => t.tenantId === tB.tenantId);
    assert.deepEqual(
      [a.code, a.name, a.isActive, a.roles],
      [tA.code, tA.name, true, ['MALL_ADMIN']],
    );
    assert.deepEqual(b.roles, ['MALL_ADMIN', 'VIEWER']);

    assert.deepEqual(a.permissions[venues.routeKey], flags(true, true, true, true));
    assert.deepEqual(
      b.permissions[venues.routeKey],
      flags(true, true, true, true),
      'OR of admin and viewer',
    );
    assert.equal(a.permissions[audit.routeKey], undefined, 'viewer role is not held in tenant A');
    assert.deepEqual(b.permissions[audit.routeKey], flags(false, true, false, false));
    assert.deepEqual(
      a.permissions[beacons.routeKey],
      flags(false, false, false, false),
      'override replaces the role row',
    );
    assert.deepEqual(b.permissions[beacons.routeKey], flags(false, false, false, false));
  });
});

test('GET /api/me: SUPERADMIN (a platform row, no tenant) is flagged and lists no tenant', async () => {
  await withApp(async (ctx) => {
    const superRole = await ctx.seed.role('SUPERADMIN', { isPlatformRole: true });
    const user = await signedInAdmin(ctx);
    await ctx.seed.userRole(user.userId, superRole, null);
    const body = await (await ctx.call('/api/me', { token: user.token })).json();
    assert.equal(body.isSuperAdmin, true);
    assert.deepEqual(body.platformRoles, ['SUPERADMIN']);
    assert.deepEqual(body.tenants, []);
  });
});

test('GET /api/me: a viewer gets only the rights of the viewer role', async () => {
  await withApp(async (ctx) => {
    const { seed } = ctx;
    const tenant = await seed.tenant('V');
    const viewer = await seed.role('VIEWER');
    const venues = await seed.route('venues');
    const users = await seed.route('users');
    await seed.rolePermission(viewer, venues, [false, true, false, false]);
    const user = await signedInAdmin(ctx);
    await seed.userRole(user.userId, viewer, tenant.tenantId);
    const body = await (await ctx.call('/api/me', { token: user.token })).json();
    assert.equal(body.isSuperAdmin, false);
    assert.deepEqual(
      body.tenants[0].permissions[venues.routeKey],
      flags(false, true, false, false),
    );
    assert.equal(
      body.tenants[0].permissions[users.routeKey],
      undefined,
      'a route with no row is not granted',
    );
  });
});

test('GET /api/me: a user with no roles at all is a valid, empty profile (200)', async () => {
  await withApp(async (ctx) => {
    const user = await signedInAdmin(ctx);
    const res = await ctx.call('/api/me', { token: user.token });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual([body.tenants, body.platformRoles, body.isSuperAdmin], [[], [], false]);
  });
});

test("GET /api/me: another user's tenants never show up (tenants are this user's UserRole rows only)", async () => {
  await withApp(async (ctx) => {
    const { seed } = ctx;
    const [mine, theirs] = [await seed.tenant('MINE'), await seed.tenant('THEIRS')];
    const viewer = await seed.role('VIEWER');
    const me = await signedInAdmin(ctx);
    const other = await seed.user();
    await seed.userRole(me.userId, viewer, mine.tenantId);
    await seed.userRole(other.userId, viewer, theirs.tenantId);
    const body = await (await ctx.call('/api/me', { token: me.token })).json();
    assert.deepEqual(
      body.tenants.map((t) => t.tenantId),
      [mine.tenantId],
    );
  });
});

test('GET /api/me: an X-Tenant-Id header does not change the answer (tenant context is S2; the token and header never choose tenants here)', async () => {
  await withApp(async (ctx) => {
    const { seed } = ctx;
    const [mine, theirs] = [await seed.tenant('MINE'), await seed.tenant('THEIRS')];
    const viewer = await seed.role('VIEWER');
    const me = await signedInAdmin(ctx);
    await seed.userRole(me.userId, viewer, mine.tenantId);
    const plain = await (await ctx.call('/api/me', { token: me.token })).json();
    const named = await (
      await ctx.call('/api/me', {
        token: me.token,
        headers: { 'x-tenant-id': String(theirs.tenantId) },
      })
    ).json();
    assert.deepEqual(named, plain);
  });
});

test('GET /api/me: a deactivated role grants nothing (Role.IsActive false)', async () => {
  await withApp(async (ctx) => {
    const { seed } = ctx;
    const tenant = await seed.tenant('R');
    const retired = await seed.role('RETIRED_ROLE_' + seed.tag, { isActive: false });
    const venues = await seed.route('venues');
    await seed.rolePermission(retired, venues, [true, true, true, true]);
    const user = await signedInAdmin(ctx);
    await seed.userRole(user.userId, retired, tenant.tenantId);
    const body = await (await ctx.call('/api/me', { token: user.token })).json();
    assert.deepEqual(body.tenants, []);
  });
});

test('GET /api/me: an inactive tenant is listed with isActive false', async () => {
  await withApp(async (ctx) => {
    const { seed } = ctx;
    const tenant = await seed.tenant('OFF', { isActive: false });
    const viewer = await seed.role('VIEWER');
    const user = await signedInAdmin(ctx);
    await seed.userRole(user.userId, viewer, tenant.tenantId);
    const body = await (await ctx.call('/api/me', { token: user.token })).json();
    assert.equal(body.tenants[0].isActive, false);
  });
});

test('GET /api/me: the answer holds no Firebase UID, token claim or secret, and is no-store', async () => {
  await withApp(async (ctx) => {
    const user = await signedInAdmin(ctx);
    const res = await ctx.call('/api/me', { token: user.token });
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const text = JSON.stringify(await res.json());
    assert.doesNotMatch(text, new RegExp(user.uid));
    assert.doesNotMatch(text, /firebase|token|password/i);
  });
});

test('GET /api/me: only GET exists (POST, PUT, DELETE with a valid token are 404)', async () => {
  await withApp(async (ctx) => {
    const user = await signedInAdmin(ctx);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      assert.equal((await ctx.call('/api/me', { token: user.token, method })).status, 404, method);
    }
  });
});

test('GET /api/me: the token age limit is read from GlobalSetting auth.idTokenMaxAgeS (real settings, real table)', async () => {
  await withApp(async (ctx) => {
    await ctx.db.query(
      'DELETE FROM gabay.GlobalSetting WHERE TenantId IS NULL AND SettingKey = $1',
      ['auth.idTokenMaxAgeS'],
    );
    await ctx.db.query(
      'INSERT INTO gabay.GlobalSetting (TenantId, SettingKey, SettingValue) VALUES (NULL, $1, $2)',
      ['auth.idTokenMaxAgeS', '120'],
    );
    const user = await signedInAdmin(ctx); // auth_time is 60 s old: inside 120
    assert.equal((await ctx.call('/api/me', { token: user.token })).status, 200);
    ctx.verify[user.token] = { uid: user.uid, iat: NOW_S - 5, auth_time: NOW_S - 121 }; // just outside
    const res = await ctx.call('/api/me', { token: user.token });
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: 'Session expired' });
  });
});

test('GET /api/me: the default limit (28800 s, 8 h) applies when no row exists', async () => {
  await withApp(async (ctx) => {
    await ctx.db.query(
      'DELETE FROM gabay.GlobalSetting WHERE TenantId IS NULL AND SettingKey = $1',
      ['auth.idTokenMaxAgeS'],
    );
    const user = await signedInAdmin(ctx);
    ctx.verify[user.token] = { uid: user.uid, iat: NOW_S - 5, auth_time: NOW_S - 28800 };
    assert.equal((await ctx.call('/api/me', { token: user.token })).status, 200);
    ctx.verify[user.token] = { uid: user.uid, iat: NOW_S - 5, auth_time: NOW_S - 28801 };
    assert.equal((await ctx.call('/api/me', { token: user.token })).status, 401);
  });
});

test('GET /api/me: a database that is down is 503, a broken query is a generic 500 (no driver text)', async () => {
  const claims = { uid: 'uid-x', iat: NOW_S - 5, auth_time: NOW_S - 5 };
  const down = {
    query: async () => {
      throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
        dbUnavailable: true,
      });
    },
  };
  const broken = {
    query: async () => {
      throw Object.assign(new Error('relation "gabay.appuser" does not exist'), {
        code: '42P01',
        severity: 'ERROR',
      });
    },
  };
  for (const [db, status, message] of [
    [down, 503, 'Database unavailable'],
    [broken, 500, 'Internal server error'],
  ]) {
    await withApp(
      async (ctx) => {
        const res = await ctx.call('/api/me', { token: 'tok' });
        assert.equal(res.status, status);
        assert.deepEqual(await res.json(), { error: message });
      },
      { db, verify: { tok: claims } },
    );
  }
});

test('GET /api/me: the identity lookup SQL fails closed after the token check, never before (a bad token never reaches the database)', async () => {
  const queries = [];
  const spy = {
    query: async (text) => {
      queries.push(text);
      return { rows: [] };
    },
  };
  await withApp(
    async (ctx) => {
      assert.equal((await ctx.call('/api/me', { token: 'bad' })).status, 401);
      assert.equal((await ctx.call('/api/me')).status, 401);
    },
    { db: spy },
  );
  assert.deepEqual(queries, [], 'no query ran for a request that carried no valid token');
});

test('the mount order: /api/health is public, an unknown /api path is still 404 with no token, /api/me needs one', async () => {
  await withApp(async ({ call }) => {
    assert.equal((await call('/api/health')).status, 200);
    assert.equal((await call('/api/does-not-exist')).status, 404);
    assert.equal((await call('/api/me')).status, 401);
  });
});

test('an unauthenticated /api/health still works when the verifier would refuse everything', async () => {
  await withApp(async ({ call, tokenVerifier }) => {
    const res = await call('/api/health');
    assert.equal(res.status, 200);
    assert.deepEqual(tokenVerifier.seen, [], 'the public route never reaches the verifier');
  });
});

test('GET /api/me (I2): a non-platform role on a NULL-tenant row grants nothing and is logged as a warning with ids only', async () => {
  await withApp(async (ctx) => {
    const { seed } = ctx;
    const viewer = await seed.role('VIEWER');
    const venues = await seed.route('venues');
    await seed.rolePermission(viewer, venues, [true, true, true, true]);
    const user = await signedInAdmin(ctx, { name: 'Ned Nobody' });
    await seed.userRole(user.userId, viewer, null); // bad data: VIEWER is not a platform role
    const body = await (await ctx.call('/api/me', { token: user.token })).json();
    assert.deepEqual([body.isSuperAdmin, body.platformRoles, body.tenants], [false, [], []]);
    const warned = ctx.logger.calls.warn.filter(([fields]) => fields.roleId === viewer);
    assert.equal(warned.length, 1);
    assert.equal(warned[0][0].userId, user.userId);
    assert.doesNotMatch(loggedText(ctx.logger.calls), /Ned Nobody|gabay.test/);
  });
});

test('GET /api/me (I4): the production wiring end to end: real firebase-admin (emulator mode) -> auth -> database -> /api/me', async () => {
  const t = await openRolledBackDb();
  const seed = createSeeder(t.db);
  const user = await seed.user({ name: 'Wired Admin' });
  const tenant = await seed.tenant('WIRED');
  await seed.userRole(user.userId, await seed.role('VIEWER'), tenant.tenantId);
  const toolkit = await fakeIdentityToolkit({ [user.uid]: {} });
  const logger = fakeLogger();
  // No tokenVerifier, settings or now injected: createApp builds its own, from the config alone.
  const app = createApp({
    config: testConfig({ FIREBASE_AUTH_EMULATOR_HOST: toolkit.host, NODE_ENV: 'test' }),
    db: t.db,
    logger,
  });
  const server = await listen(app);
  const token = unsignedIdToken({ uid: user.uid, iat: nowSeconds() - 20 });
  try {
    const ok = await fetch(`${server.url}/api/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.deepEqual(body.user, {
      userId: user.userId,
      email: user.email,
      displayName: 'Wired Admin',
    });
    assert.deepEqual(
      body.tenants.map((x) => [x.tenantId, x.roles]),
      [[tenant.tenantId, ['VIEWER']]],
    );
    assert.equal(
      toolkit.requests.length,
      1,
      'the SDK asked Firebase about the user (revocation check)',
    );

    // The same wiring with Firebase gone: 503, and neither the token nor anything of the SDK error leaks.
    await toolkit.close();
    const down = await fetch(`${server.url}/api/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(down.status, 503);
    assert.deepEqual(await down.json(), { error: 'Authentication service unavailable' });
    assert.ok(logger.calls.error.length > 0, 'the failure was logged');
    assert.doesNotMatch(loggedText(logger.calls), new RegExp(token.split('.')[1].slice(0, 30)));
  } finally {
    await server.close();
    await toolkit.close().catch(() => {});
    await t.close();
  }
});
