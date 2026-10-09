// Test helpers for the sign-in slice (P2-S1). Not a test file (no .test.js), so `node --test` does not run it.
//
//   unsignedIdToken      a token the Auth emulator would issue: alg "none", the claims Firebase puts in an ID token
//   fakeIdentityToolkit  a tiny HTTP server that answers the one call the Admin SDK makes in emulator mode to check
//                        revocation (accounts:lookup), so the REAL firebase-admin code path is tested with no
//                        emulator process (the api-tests check runs before the seed starts the emulator)
//   fakeTokenVerifier    the dependency-injection double for the middleware tests: a table of token -> claims
//   openRolledBackDb     a one-connection database held inside a transaction that is ALWAYS rolled back, so a test
//                        can insert users, roles and permissions into the real tables and nothing is ever kept
//   seedAccess           the rows a sign-in needs, created in that transaction under unique names
'use strict';

const { randomUUID } = require('node:crypto');
const http = require('node:http');
const { httpError } = require('../src/utils/errors');
const { singleConnectionDb } = require('./helpers');

const EMULATOR_PROJECT = 'demo-gabay';

const base64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** Seconds since the epoch, the unit JWT claims use. */
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** A token as the Auth emulator issues it: unsigned (alg "none"), with iat, auth_time, exp, aud, iss, sub. */
function unsignedIdToken({
  uid,
  projectId = EMULATOR_PROJECT,
  iat = nowSeconds(),
  authTime = iat,
  exp = iat + 3600,
  extra = {},
} = {}) {
  const header = { alg: 'none', typ: 'JWT' };
  const payload = {
    iss: `https://securetoken.google.com/${projectId}`,
    aud: projectId,
    auth_time: authTime,
    user_id: uid,
    sub: uid,
    iat,
    exp,
    firebase: { identities: {}, sign_in_provider: 'password' },
    ...extra,
  };
  return `${base64url(header)}.${base64url(payload)}.`;
}

/**
 * Stands in for the Auth emulator's Identity Toolkit REST surface. users: uid -> { disabled, validSince }
 * (validSince is a string of epoch seconds, as Firebase sends it). A uid not in the table is "not found".
 * `requests` records every lookup so a test can show that the revocation check really happens.
 */
async function fakeIdentityToolkit(users = {}) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const parsed = body ? JSON.parse(body) : {};
      requests.push({ method: req.method, url: req.url, body: parsed });
      res.setHeader('content-type', 'application/json');
      if (req.method === 'POST' && req.url.includes('accounts:lookup')) {
        const found = (parsed.localId ?? [])
          .filter((uid) => Object.hasOwn(users, uid))
          .map((uid) => ({ localId: uid, email: `${uid}@gabay.test`, ...users[uid] }));
        res.end(
          JSON.stringify(
            found.length > 0
              ? { kind: 'identitytoolkit#GetAccountInfoResponse', users: found }
              : {},
          ),
        );
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: { message: 'NOT_FOUND' } }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    users,
    requests,
    host: `127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * The injected verifier of the middleware tests. `table` maps a token string to the claims it verifies to,
 * or to an Error to throw. An unknown token is refused the way the real verifier refuses one.
 */
function fakeTokenVerifier(table = {}) {
  const seen = [];
  return {
    seen,
    async verifyIdToken(token) {
      seen.push(token);
      const entry = table[token];
      if (entry instanceof Error) throw entry;
      if (!entry) throw httpError(401, 'Invalid session');
      return entry;
    },
    async close() {},
  };
}

/** A single-connection db inside a transaction; close() rolls back (always) and ends the pool. */
async function openRolledBackDb() {
  const db = singleConnectionDb();
  await db.query('BEGIN', []);
  let closed = false;
  return {
    db,
    async close() {
      if (closed) return;
      closed = true;
      try {
        await db.query('ROLLBACK', []);
      } finally {
        await db.close();
      }
    },
  };
}

/** A short unique tag so two runs (or a seeded database) never collide on a unique column. */
const uniqueTag = () => randomUUID().replaceAll('-', '').slice(0, 10);

const first = async (db, text, params) => (await db.query(text, params)).rows[0];

/** Inserts (inside the open transaction) and returns the ids. Every name carries `tag`. */
function createSeeder(db, tag = uniqueTag()) {
  return {
    tag,
    async tenant(label, { isActive = true } = {}) {
      const row = await first(
        db,
        `INSERT INTO gabay.Tenant (Code, Name, IsActive) VALUES ($1, $2, $3) RETURNING TenantId`,
        [`T_${label}_${tag}`.slice(0, 40), `Tenant ${label} ${tag}`, isActive],
      );
      return {
        tenantId: row.tenantid,
        code: `T_${label}_${tag}`.slice(0, 40),
        name: `Tenant ${label} ${tag}`,
      };
    },
    /**
     * The role with this code: the seeded one if the database has it (read only, so no seeded row is locked), else
     * created here (rolled back at the end). isActive and isPlatformRole apply only when it is created.
     */
    async role(code, { isActive = true, isPlatformRole = false } = {}) {
      const found = await first(db, `SELECT RoleId FROM gabay.Role WHERE Code = $1`, [code]);
      if (found) return found.roleid;
      const row = await first(
        db,
        `INSERT INTO gabay.Role (Code, Label, IsPlatformRole, IsActive) VALUES ($1, $1, $2, $3) RETURNING RoleId`,
        [code, isPlatformRole, isActive],
      );
      return row.roleid;
    },
    async user({ uid = `uid-${tag}-${uniqueTag()}`, isActive = true, name = 'Test User' } = {}) {
      const email = `${uniqueTag()}@gabay.test`;
      const row = await first(
        db,
        `INSERT INTO gabay.AppUser (FirebaseUid, Email, DisplayName, IsActive) VALUES ($1, $2, $3, $4) RETURNING UserId`,
        [uid, email, name, isActive],
      );
      return { userId: row.userid, uid, email, displayName: name };
    },
    async shopper({ uid = `shopper-${tag}-${uniqueTag()}` } = {}) {
      const email = `${uniqueTag()}@gabay.test`;
      const row = await first(
        db,
        `INSERT INTO gabay.ShopperAccount (FirebaseUid, Email, AuthProvider, DisplayName)
         VALUES ($1, $2, 'password', 'Test Shopper') RETURNING ShopperAccountId`,
        [uid, email],
      );
      return { shopperAccountId: row.shopperaccountid, uid, email };
    },
    async userRole(userId, roleId, tenantId) {
      await db.query(`INSERT INTO gabay.UserRole (UserId, RoleId, TenantId) VALUES ($1, $2, $3)`, [
        userId,
        roleId,
        tenantId,
      ]);
    },
    async route(key) {
      const routeKey = `${key}-${tag}`;
      const row = await first(
        db,
        `INSERT INTO gabay.PermissionRoute (RouteKey, Label) VALUES ($1, $1) RETURNING PermissionRouteId`,
        [routeKey],
      );
      return { routeKey, permissionRouteId: row.permissionrouteid };
    },
    async rolePermission(roleId, route, [c, r, u, d]) {
      await db.query(
        `INSERT INTO gabay.RolePermission (RoleId, PermissionRouteId, CanCreate, CanRead, CanUpdate, CanDelete)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (RoleId, PermissionRouteId) DO NOTHING`,
        [roleId, route.permissionRouteId, c, r, u, d],
      );
    },
    async userPermission(userId, route, [c, r, u, d]) {
      await db.query(
        `INSERT INTO gabay.UserPermission (UserId, PermissionRouteId, CanCreate, CanRead, CanUpdate, CanDelete)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, route.permissionRouteId, c, r, u, d],
      );
    },
  };
}

/**
 * Everything a fakeLogger recorded as one string, with Error objects opened up (name, message, stack, own fields,
 * cause), because JSON.stringify shows an Error as {} and a leak inside one would go unseen.
 */
function loggedText(calls) {
  const seen = new WeakSet();
  return JSON.stringify(calls, function open(_key, value) {
    if (value instanceof Error) {
      if (seen.has(value)) return '[circular]';
      seen.add(value);
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
        ...value,
        cause: value.cause,
      };
    }
    return value;
  });
}

module.exports = {
  loggedText,
  EMULATOR_PROJECT,
  nowSeconds,
  unsignedIdToken,
  fakeIdentityToolkit,
  fakeTokenVerifier,
  openRolledBackDb,
  createSeeder,
  uniqueTag,
};
