'use strict';

// FF-0 (E-20; plan/FF0-dev-stub-lookups.md section 2): the development stub. Until the retrofit's R1 the admin routes run
// behind it. It must fill exactly what the real chain will fill (req.user, req.tenantCompanyID, the actor and the
// tenant in the request context), refuse to exist outside NODE_ENV=development|test (raw environment), and never
// be a way around the tenant rule: a tenant the user does not hold is a 403, never a pass.
//
// Real SQL on a real database inside a transaction that is always rolled back (authHelpers.js); the stub is mounted on a
// tiny Express app so each assertion sees exactly what a handler would see.

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { parseConfig } = require('../src/config');
const { createDevStub, STARTUP_LINE } = require('../src/middleware/devStub');
const { createIdentityStore } = require('../src/auth/identityStore');
const { createAccessStore } = require('../src/auth/accessStore');
const { actorContext } = require('../src/middleware/actorContext');
const { createRequestId } = require('../src/middleware/requestId');
const { createErrorHandler } = require('../src/utils/errors');
const { getActorId, getTenantId } = require('../src/utils/requestContext');
const { testConfig, fakeLogger, listen } = require('./helpers');
const { openRolledBackDb, createSeeder, loggedText } = require('./authHelpers');

const BASE = { PGHOST: 'h', PGDATABASE: 'd', PGUSER: 'u', PGPASSWORD: 'p' };

function stubFor({ config, db, logger = fakeLogger() }) {
  return createDevStub({
    config,
    logger,
    identities: createIdentityStore(db),
    accessStore: createAccessStore(db),
  });
}

/** An app with the stub in front of one route that reports what a handler sees, after an async hop. */
async function serve(stub, db, logger) {
  const app = express();
  app.use(createRequestId(logger));
  app.use(actorContext);
  app.use('/probe', stub);
  app.get('/probe', async (req, res) => {
    await new Promise((resolve) => setImmediate(resolve)); // an async hop
    await db.query('SELECT 1', []); // and a database one
    res.json({
      reached: true,
      user: req.user,
      tenantCompanyID: req.tenantCompanyID,
      actorId: getActorId(),
      contextTenantId: getTenantId(),
    });
  });
  app.use(createErrorHandler(logger));
  const server = await listen(app);
  return {
    call: (path = '/probe', headers = {}) => fetch(`${server.url}${path}`, { headers }),
    server,
  };
}

/** A user holding roles in tenants A and B (and not C), the stub for it, and a probe app. */
async function withProbe(fn) {
  const t = await openRolledBackDb();
  const logger = fakeLogger();
  const seed = createSeeder(t.db);
  const role = await seed.role('MALL_ADMIN');
  // Codes sort A, B, C whatever the tag.
  const tenantA = await seed.tenant('A');
  const tenantB = await seed.tenant('B');
  const tenantC = await seed.tenant('C'); // the user holds no role here
  const user = await seed.user({ name: 'Stub Admin' });
  await seed.userRole(user.userId, role, tenantB.tenantId); // granted first on purpose: the default is by Code, not by row
  await seed.userRole(user.userId, role, tenantA.tenantId);
  const config = testConfig({ DEV_STUB_USER_EMAIL: user.email });
  const probe = await serve(stubFor({ config, db: t.db, logger }), t.db, logger);
  try {
    await fn({ call: probe.call, user, tenantA, tenantB, tenantC, logger, db: t.db, seed });
  } finally {
    await probe.server.close();
    await t.close();
  }
}

/** The status and body of a probe through a stub that reads `email` as its user. */
async function probeWithEmail({ db, logger }, email) {
  const probe = await serve(
    stubFor({ config: testConfig({ DEV_STUB_USER_EMAIL: email }), db, logger }),
    db,
    logger,
  );
  try {
    const res = await probe.call();
    return { status: res.status, body: await res.json() };
  } finally {
    await probe.server.close();
  }
}

test('devStub: it is refused outside NODE_ENV=development or test, in the RAW environment (unset, empty, production)', async () => {
  const t = await openRolledBackDb();
  try {
    const cases = {
      unset: { ...BASE },
      empty: { ...BASE, NODE_ENV: '' },
      production: { ...BASE, NODE_ENV: 'production' },
    };
    for (const [name, env] of Object.entries(cases)) {
      assert.throws(
        () => stubFor({ config: parseConfig(env), db: t.db }),
        (err) => {
          assert.match(err.message, /NODE_ENV/, name);
          assert.match(err.message, /E-20/, name);
          return true;
        },
        name,
      );
    }
  } finally {
    await t.close();
  }
});

test('devStub: it is accepted for NODE_ENV=development and NODE_ENV=test', async () => {
  const t = await openRolledBackDb();
  try {
    for (const NODE_ENV of ['development', 'test']) {
      const stub = stubFor({ config: parseConfig({ ...BASE, NODE_ENV }), db: t.db });
      assert.equal(typeof stub, 'function', NODE_ENV);
    }
  } finally {
    await t.close();
  }
});

test('devStub: the startup line is logged once per stub, at creation and not per request', async () => {
  await withProbe(async ({ call, logger }) => {
    const lines = () => logger.calls.info.filter(([first]) => first === STARTUP_LINE);
    assert.equal(STARTUP_LINE, 'DEV STUB ACTIVE (E-20): admin routes run without sign-in');
    assert.equal(lines().length, 1);
    await call();
    await call();
    assert.equal(lines().length, 1, 'still once after requests');
  });
});

test('devStub: it fills req.user, req.tenantCompanyID, the actor and the context tenant, and they survive an async hop', async () => {
  await withProbe(async ({ call, user, tenantA }) => {
    const body = await (await call()).json();
    assert.equal(body.user.kind, 'admin');
    assert.equal(body.user.userId, user.userId);
    assert.equal(body.user.email, user.email);
    assert.equal(body.user.displayName, 'Stub Admin');
    assert.equal(body.user.uid, user.uid);
    assert.equal(Object.hasOwn(body.user, 'isActive'), false, 'the same fields as the real auth');
    assert.equal(
      Object.hasOwn(body.user, 'tenantId'),
      false,
      'req.user carries no tenant (rule 2)',
    );
    assert.equal(body.tenantCompanyID, tenantA.tenantId);
    assert.equal(body.actorId, user.userId);
    assert.equal(body.contextTenantId, tenantA.tenantId);
  });
});

test("devStub: with no X-Tenant-Id the user's first tenant by Tenant.Code is used, whatever order the roles were granted in", async () => {
  await withProbe(async ({ call, tenantA }) => {
    assert.equal((await (await call()).json()).tenantCompanyID, tenantA.tenantId);
  });
});

test('devStub: an X-Tenant-Id the user holds is used, for the request and for the context', async () => {
  await withProbe(async ({ call, tenantB }) => {
    const body = await (await call('/probe', { 'X-Tenant-Id': String(tenantB.tenantId) })).json();
    assert.equal(body.tenantCompanyID, tenantB.tenantId);
    assert.equal(body.contextTenantId, tenantB.tenantId);
  });
});

test('devStub: an X-Tenant-Id the user does not hold is 403 in the { error } shape, and so is a malformed or unknown one', async () => {
  await withProbe(async ({ call, tenantC }) => {
    for (const value of [String(tenantC.tenantId), '2147483647', 'abc', '1e3', '-1', '0']) {
      const res = await call('/probe', { 'X-Tenant-Id': value });
      assert.equal(res.status, 403, value);
      assert.deepEqual(
        await res.json(),
        { error: 'This account has no access to that tenant' },
        value,
      );
    }
  });
});

test('devStub: an empty X-Tenant-Id counts as no header (the default tenant)', async () => {
  await withProbe(async ({ call, tenantA }) => {
    const res = await call('/probe', { 'X-Tenant-Id': ' ' });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).tenantCompanyID, tenantA.tenantId);
  });
});

test("devStub: the tenant comes only from the user's UserRole rows: a query-string tenant is ignored", async () => {
  await withProbe(async ({ call, tenantA, tenantC }) => {
    const res = await call(
      `/probe?tenantId=${tenantC.tenantId}&tenantCompanyID=${tenantC.tenantId}`,
    );
    assert.equal((await res.json()).tenantCompanyID, tenantA.tenantId);
  });
});

test('devStub: a missing or inactive stub user is a 500 that tells the developer what to fix, never a pass', async () => {
  await withProbe(async (ctx) => {
    const inactive = await ctx.seed.user({ isActive: false });
    const gone = await probeWithEmail(ctx, 'nobody-here@gabay.test');
    assert.equal(gone.status, 500);
    assert.match(gone.body.error, /DEV_STUB_USER_EMAIL/);
    assert.match(gone.body.error, /not found/);
    assert.equal(gone.body.reached, undefined);
    const off = await probeWithEmail(ctx, inactive.email);
    assert.equal(off.status, 500);
    assert.match(off.body.error, /DEV_STUB_USER_EMAIL/);
    assert.match(off.body.error, /not active/);
    assert.equal(off.body.reached, undefined);
  });
});

test('devStub: a user with no tenant role is a 500 naming the fix (the SUPERADMIN has no tenant row, L154)', async () => {
  await withProbe(async (ctx) => {
    const lonely = await ctx.seed.user();
    const res = await probeWithEmail(ctx, lonely.email);
    assert.equal(res.status, 500);
    assert.match(res.body.error, /no tenant/);
    assert.equal(res.body.reached, undefined);
  });
});

test('devStub: the log names the exception and never an email, id token or password', async () => {
  await withProbe(async ({ call, logger, user }) => {
    await call();
    const text = loggedText(logger.calls);
    assert.match(text, /E-20/);
    assert.equal(text.includes(user.email), false);
  });
});
