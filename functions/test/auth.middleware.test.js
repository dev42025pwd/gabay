'use strict';

// P2-S1: the auth middleware (Blueprint order: requestId -> actorContext -> rate limit -> AUTH -> tenantContext ...).
// Collaborators are injected (a fake verifier, a fake identity store, a fake settings resolver), so every refusal
// is shown without Firebase or a database. The real SQL has its own tests (auth.identityStore.test.js) and the real
// SDK its own (firebaseVerifier.test.js); the wiring of all three is in me.test.js.
//
// Which status for which refusal (standard §3.8; plan/PH2-identity.md Q5: "a 401 from the API (revoked or
// disabled)" is what ends a session on the client):
//   no / malformed header, bad / expired / revoked token, token older than the limit, inactive user -> 401
//   a good Firebase identity that has no Gabay account                                              -> 403
//   Firebase or the database cannot be reached                                                     -> 503 (fail closed)

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createAuth, requireAdminUser } = require('../src/middleware/auth');
const { actorContext } = require('../src/middleware/actorContext');
const { createErrorHandler, httpError } = require('../src/utils/errors');
const { getActorId, getTenantId } = require('../src/utils/requestContext');
const { DEFAULTS } = require('../src/config/settings');
const { listen, fakeLogger } = require('./helpers');
const { fakeTokenVerifier } = require('./authHelpers');

const NOW_MS = 1_800_000_000_000;
const NOW_S = NOW_MS / 1000;
const MAX_AGE = DEFAULTS['auth.idTokenMaxAgeS'];

const ADMIN = { kind: 'admin', userId: 11, email: 'a@x.test', displayName: 'Ann', isActive: true };
const claimsAged = (uid, ageS) => ({ uid, iat: NOW_S - ageS, auth_time: NOW_S - ageS });

function fakeIdentities(byUid = {}) {
  const asked = [];
  return {
    asked,
    async findByFirebaseUid(uid) {
      asked.push(uid);
      const hit = byUid[uid];
      if (hit instanceof Error) throw hit;
      return hit ?? null;
    },
  };
}

function fakeSettings(value) {
  const asked = [];
  return {
    asked,
    async getSetting(key, tenantId) {
      asked.push([key, tenantId]);
      return value === undefined ? DEFAULTS[key] : value;
    },
  };
}

/** A mini app: actorContext -> auth -> GET /who (answers what the handler can see) -> errors. */
async function mount({ verifier, identities, settings = fakeSettings(), guard = [] }) {
  const logger = fakeLogger();
  const app = express();
  app.use((req, res, next) => {
    req.log = logger.child({});
    next();
  });
  app.use(actorContext);
  app.get('/open', (req, res) => res.json({ open: true }));
  app.use(createAuth({ verifier, identities, settings, now: () => NOW_MS }));
  app.get('/who', ...guard, async (req, res) => {
    await new Promise((resolve) => setImmediate(resolve)); // the actor must survive an async hop
    res.json({ user: req.user, actor: getActorId(), tenant: getTenantId() });
  });
  app.use(createErrorHandler(logger));
  const server = await listen(app);
  return { ...server, logger };
}

const get = (s, token, scheme = 'Bearer') =>
  fetch(`${s.url}/who`, {
    headers: token === undefined ? {} : { authorization: `${scheme} ${token}` },
  });

test('auth: no Authorization header is 401 and the verifier is never asked', async () => {
  const verifier = fakeTokenVerifier();
  const s = await mount({ verifier, identities: fakeIdentities() });
  try {
    const res = await get(s, undefined);
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: 'Authentication required' });
    assert.deepEqual(verifier.seen, []);
  } finally {
    await s.close();
  }
});

test('auth: a header that is not "Bearer <token>" is 401 and the verifier is never asked', async () => {
  const verifier = fakeTokenVerifier();
  const s = await mount({ verifier, identities: fakeIdentities() });
  try {
    for (const value of [
      'Basic dXNlcjpwdw==',
      'Bearer',
      'Bearer ',
      'Bearer a b',
      'Token abc',
      'abc',
      '',
    ]) {
      const res = await fetch(`${s.url}/who`, { headers: { authorization: value } });
      assert.equal(res.status, 401, JSON.stringify(value));
      assert.deepEqual(await res.json(), { error: 'Authentication required' });
    }
    assert.deepEqual(verifier.seen, []);
  } finally {
    await s.close();
  }
});

test('auth: the scheme word is case-insensitive', async () => {
  const verifier = fakeTokenVerifier({ tok: claimsAged('uid-a', 5) });
  const s = await mount({ verifier, identities: fakeIdentities({ 'uid-a': ADMIN }) });
  try {
    assert.equal((await get(s, 'tok', 'bearer')).status, 200);
    assert.equal((await get(s, 'tok', 'BEARER')).status, 200);
  } finally {
    await s.close();
  }
});

test("auth: the verifier's own refusal (bad, expired, revoked token) is passed on with its status and message", async () => {
  const verifier = fakeTokenVerifier({
    expired: httpError(401, 'Session expired'),
    revoked: httpError(401, 'Invalid session'),
  });
  const s = await mount({ verifier, identities: fakeIdentities() });
  try {
    const expired = await get(s, 'expired');
    assert.equal(expired.status, 401);
    assert.deepEqual(await expired.json(), { error: 'Session expired' });
    const revoked = await get(s, 'revoked');
    assert.equal(revoked.status, 401);
    assert.deepEqual(await revoked.json(), { error: 'Invalid session' });
    assert.equal((await get(s, 'never-heard-of-it')).status, 401);
  } finally {
    await s.close();
  }
});

test('auth: when the verifier cannot reach Firebase the request is 503 (fail closed), not passed', async () => {
  const verifier = fakeTokenVerifier({
    down: httpError(503, 'Authentication service unavailable', { expose: true }),
  });
  const s = await mount({ verifier, identities: fakeIdentities() });
  try {
    const res = await get(s, 'down');
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: 'Authentication service unavailable' });
  } finally {
    await s.close();
  }
});

test('auth: a token older than the limit is 401 "Session expired"; exactly the limit is still accepted', async () => {
  const verifier = fakeTokenVerifier({
    exact: claimsAged('uid-a', MAX_AGE),
    over: claimsAged('uid-a', MAX_AGE + 1),
  });
  const identities = fakeIdentities({ 'uid-a': ADMIN });
  const s = await mount({ verifier, identities });
  try {
    assert.equal((await get(s, 'exact')).status, 200);
    identities.asked.length = 0;
    const res = await get(s, 'over');
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: 'Session expired' });
    assert.deepEqual(identities.asked, [], 'refused before the database is asked');
  } finally {
    await s.close();
  }
});

test('auth: the limit is read from the setting auth.idTokenMaxAgeS, for the platform (no tenant)', async () => {
  const settings = fakeSettings(600);
  const verifier = fakeTokenVerifier({
    ok: claimsAged('uid-a', 600),
    old: claimsAged('uid-a', 601),
  });
  const s = await mount({ verifier, identities: fakeIdentities({ 'uid-a': ADMIN }), settings });
  try {
    assert.equal((await get(s, 'ok')).status, 200);
    assert.equal((await get(s, 'old')).status, 401);
    assert.deepEqual(settings.asked[0], ['auth.idTokenMaxAgeS', null]);
  } finally {
    await s.close();
  }
});

test('auth: a setting that is not a positive number falls back to the default (never locks everyone out)', async () => {
  for (const bad of [0, -5, NaN, Infinity, 'soon', null, undefined]) {
    const verifier = fakeTokenVerifier({
      fresh: claimsAged('uid-a', 10),
      old: claimsAged('uid-a', MAX_AGE + 1),
    });
    const s = await mount({
      verifier,
      identities: fakeIdentities({ 'uid-a': ADMIN }),
      settings: { getSetting: async () => bad },
    });
    try {
      assert.equal((await get(s, 'fresh')).status, 200, `setting ${String(bad)}`);
      assert.equal((await get(s, 'old')).status, 401, `setting ${String(bad)}`);
    } finally {
      await s.close();
    }
  }
});

test('auth: a token with no usable iat is 401 "Invalid session"', async () => {
  const verifier = fakeTokenVerifier({
    none: { uid: 'uid-a' },
    text: { uid: 'uid-a', iat: 'yesterday' },
    nan: { uid: 'uid-a', iat: NaN },
  });
  const s = await mount({ verifier, identities: fakeIdentities({ 'uid-a': ADMIN }) });
  try {
    for (const token of ['none', 'text', 'nan']) {
      const res = await get(s, token);
      assert.equal(res.status, 401, token);
      assert.deepEqual(await res.json(), { error: 'Invalid session' });
    }
  } finally {
    await s.close();
  }
});

test('auth: a token issued in the future (clock skew) is not refused for its age', async () => {
  const verifier = fakeTokenVerifier({ skew: { uid: 'uid-a', iat: NOW_S + 30 } });
  const s = await mount({ verifier, identities: fakeIdentities({ 'uid-a': ADMIN }) });
  try {
    assert.equal((await get(s, 'skew')).status, 200);
  } finally {
    await s.close();
  }
});

test('auth: a valid Firebase identity with no Gabay account is 403 (signed in, but nothing here)', async () => {
  const verifier = fakeTokenVerifier({ tok: claimsAged('stranger', 5) });
  const identities = fakeIdentities();
  const s = await mount({ verifier, identities });
  try {
    const res = await get(s, 'tok');
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: 'This account has no access' });
    assert.deepEqual(identities.asked, ['stranger']);
  } finally {
    await s.close();
  }
});

test('auth: an inactive Gabay user is 401 "Account is not active" (access revoked here, Firebase still signs them in)', async () => {
  const verifier = fakeTokenVerifier({ tok: claimsAged('uid-a', 5) });
  const s = await mount({
    verifier,
    identities: fakeIdentities({ 'uid-a': { ...ADMIN, isActive: false } }),
  });
  try {
    const res = await get(s, 'tok');
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: 'Account is not active' });
  } finally {
    await s.close();
  }
});

test('auth: success sets req.user and fills the actor with the user id, across an async hop', async () => {
  const verifier = fakeTokenVerifier({ tok: claimsAged('uid-a', 5) });
  const s = await mount({ verifier, identities: fakeIdentities({ 'uid-a': ADMIN }) });
  try {
    const body = await (await get(s, 'tok')).json();
    assert.deepEqual(body.user, {
      kind: 'admin',
      uid: 'uid-a',
      userId: 11,
      email: 'a@x.test',
      displayName: 'Ann',
    });
    assert.equal(body.actor, 11);
    assert.equal(body.tenant, null, 'no tenant yet: tenantContext (S2) sets it, never the token');
  } finally {
    await s.close();
  }
});

test('auth: req.user carries no tenant of any kind, even if the token claims one (rule 2)', async () => {
  const verifier = fakeTokenVerifier({
    tok: {
      ...claimsAged('uid-a', 5),
      tenantId: 99,
      tenant: 'x',
      companyId: 99,
      role: 'SUPERADMIN',
    },
  });
  const s = await mount({ verifier, identities: fakeIdentities({ 'uid-a': ADMIN }) });
  try {
    const { user } = await (await get(s, 'tok')).json();
    assert.deepEqual(Object.keys(user).sort(), ['displayName', 'email', 'kind', 'uid', 'userId']);
  } finally {
    await s.close();
  }
});

test('auth: the routes mounted before it stay public (unauthenticated mounts first)', async () => {
  const s = await mount({ verifier: fakeTokenVerifier(), identities: fakeIdentities() });
  try {
    assert.equal((await fetch(`${s.url}/open`)).status, 200);
  } finally {
    await s.close();
  }
});

test('auth: a shopper account resolves too (Q12) but has no AppUser actor; admin-only routes refuse it with 403', async () => {
  const shopper = { kind: 'shopper', shopperAccountId: 5, email: 's@x.test', displayName: 'Sam' };
  const verifier = fakeTokenVerifier({ tok: claimsAged('uid-s', 5) });
  const s = await mount({
    verifier,
    identities: fakeIdentities({ 'uid-s': shopper }),
    guard: [requireAdminUser],
  });
  const open = await mount({ verifier, identities: fakeIdentities({ 'uid-s': shopper }) });
  try {
    const refused = await get(s, 'tok');
    assert.equal(refused.status, 403);
    assert.deepEqual(await refused.json(), { error: 'This account has no access' });

    const body = await (await get(open, 'tok')).json();
    assert.equal(body.user.kind, 'shopper');
    assert.equal(body.user.shopperAccountId, 5);
    assert.equal(
      body.actor,
      null,
      'AppUser ids stamp CreatedBy; a shopper id must never be mistaken for one',
    );
  } finally {
    await s.close();
    await open.close();
  }
});

test('auth: requireAdminUser lets an admin through', async () => {
  const verifier = fakeTokenVerifier({ tok: claimsAged('uid-a', 5) });
  const s = await mount({
    verifier,
    identities: fakeIdentities({ 'uid-a': ADMIN }),
    guard: [requireAdminUser],
  });
  try {
    assert.equal((await get(s, 'tok')).status, 200);
  } finally {
    await s.close();
  }
});

test('auth: requireAdminUser with no req.user (auth not mounted before it) is 401, never a pass', async () => {
  const app = express();
  app.get('/x', requireAdminUser, (req, res) => res.json({ reached: true }));
  app.use(createErrorHandler(fakeLogger()));
  const s = await listen(app);
  try {
    assert.equal((await fetch(`${s.url}/x`)).status, 401);
  } finally {
    await s.close();
  }
});

test('auth: a database that is down is 503, and any other lookup failure is a generic 500 with no driver text', async () => {
  const down = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
    dbUnavailable: true,
  });
  const broken = Object.assign(new Error('relation "gabay.appuser" does not exist'), {
    code: '42P01',
    severity: 'ERROR',
  });
  const verifier = fakeTokenVerifier({ a: claimsAged('uid-a', 5), b: claimsAged('uid-b', 5) });
  const s = await mount({
    verifier,
    identities: fakeIdentities({ 'uid-a': down, 'uid-b': broken }),
  });
  try {
    const a = await get(s, 'a');
    assert.equal(a.status, 503);
    assert.deepEqual(await a.json(), { error: 'Database unavailable' });
    const b = await get(s, 'b');
    assert.equal(b.status, 500);
    const text = JSON.stringify(await b.json());
    assert.equal(text, JSON.stringify({ error: 'Internal server error' }));
    assert.doesNotMatch(text, /gabay|appuser|relation/i);
  } finally {
    await s.close();
  }
});

test('auth: the bearer token is never written to a log line', async () => {
  const secret = 'SECRET-TOKEN-VALUE-123';
  const verifier = fakeTokenVerifier({
    [secret]: claimsAged('uid-a', 5),
    'bad-SECRET-TOKEN-VALUE-123': httpError(401, 'Invalid session'),
  });
  const s = await mount({ verifier, identities: fakeIdentities({ 'uid-a': ADMIN }) });
  try {
    await get(s, secret);
    await get(s, 'bad-SECRET-TOKEN-VALUE-123');
    assert.doesNotMatch(JSON.stringify(s.logger.calls), /SECRET-TOKEN-VALUE/);
  } finally {
    await s.close();
  }
});

test('auth: concurrent requests for different users never see each other as the actor', async () => {
  const table = {};
  const people = {};
  for (let i = 1; i <= 8; i += 1) {
    table[`t${i}`] = claimsAged(`uid-${i}`, 5);
    people[`uid-${i}`] = { ...ADMIN, userId: i };
  }
  const s = await mount({ verifier: fakeTokenVerifier(table), identities: fakeIdentities(people) });
  try {
    const bodies = await Promise.all(
      Object.keys(table).map((t) => get(s, t).then((r) => r.json())),
    );
    assert.deepEqual(
      bodies.map((b) => [b.user.userId, b.actor]),
      [1, 2, 3, 4, 5, 6, 7, 8].map((n) => [n, n]),
    );
  } finally {
    await s.close();
  }
});
