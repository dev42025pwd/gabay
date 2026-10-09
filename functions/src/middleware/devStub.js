// devStub (EXCEPTIONS E-20; plan/FF0-dev-stub-lookups.md section 2): until the retrofit's R1, admin routes run behind this
// instead of auth -> tenantContext. It fills exactly the fields the real chain fills, so R1 swaps ONE middleware and
// edits no route:
//   req.user              { kind: 'admin', userId, email, displayName, uid }  (the shape auth.js builds; no tenant, rule 2)
//   req.tenantCompanyID   the tenant the request acts for (rule 2: the only source routes read)
//   the actor context     runWithActor(userId, next, { tenantId }) so CreatedBy/UpdatedBy and getTenantId() work
// There is NO sign-in and NO permission check here (waived items 3 and 4, closed by R1 to R3).
//
// Refused at creation unless the RAW environment says NODE_ENV=development or test (config.devOnlyAllowed, the same
// rule as S1's Auth emulator guard, L151): a deployed function that forgot NODE_ENV must not run without sign-in.
// Nothing built on it is deployed (E-20's hard rules).
//
// The user is the AppUser named by DEV_STUB_USER_EMAIL (default malladmin@gabay.test, L154), loaded per request through
// S1's identity store, so a changed seed or setting takes effect without a restart.
// DESIGN CHOICE: a missing, inactive or tenant-less user is a 500 with a message that says what to fix, on the request, not
// a failure at startup. Alternative: check once at startup (createApp is synchronous and index.js builds the app lazily,
// so that would need an async start for a development-only convenience).
//
// The tenant (a small copy of S2's rule; R1 replaces it with S2 itself): X-Tenant-Id when present, which must be a tenant
// where the user has a UserRole row, else 403; with no header, the user's first tenant by Tenant.Code.
'use strict';

const { httpError } = require('../utils/errors');
const { runWithActor } = require('../utils/requestContext');

const STARTUP_LINE = 'DEV STUB ACTIVE (E-20): admin routes run without sign-in';
const TENANT_HEADER = 'x-tenant-id';
const TENANT_ID_PATTERN = /^\d{1,9}$/;

const MSG = Object.freeze({
  refused:
    'The development stub (E-20) is refused: NODE_ENV must be written explicitly as development or test in the environment',
  userMissing:
    'Development stub (E-20): the user named by DEV_STUB_USER_EMAIL was not found. Set it in .env to a seeded admin account.',
  userInactive:
    'Development stub (E-20): the user named by DEV_STUB_USER_EMAIL is not active. Set it in .env to an active admin account.',
  noTenant:
    'Development stub (E-20): the user named by DEV_STUB_USER_EMAIL has no tenant role (the SUPERADMIN has none). Set it in .env to a mall admin.',
  tenantNotHeld: 'This account has no access to that tenant',
});

/** The user's tenants from their UserRole rows, each once, first by Tenant.Code: [{ tenantId, code }]. */
function tenantsOf(roles) {
  const byId = new Map();
  for (const role of roles) {
    if (role.tenantId !== null && !byId.has(role.tenantId)) {
      byId.set(role.tenantId, { tenantId: role.tenantId, code: role.tenantCode });
    }
  }
  return [...byId.values()].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

/**
 * @param {object} deps
 * @param {{devOnlyAllowed: boolean, devStub: {userEmail: string}}} deps.config
 * @param {{info: Function}} deps.logger  the root logger: the startup line goes here once
 * @param {{findAdminByEmail: (email: string) => Promise<object|null>}} deps.identities  S1's identity store
 * @param {{loadForUser: (userId: number) => Promise<{roles: object[]}>}} deps.accessStore  its UserRole rows are the tenants (L121)
 * @returns {import('express').RequestHandler}
 * @throws {Error} unless the raw environment says NODE_ENV=development or test
 */
function createDevStub({ config, logger, identities, accessStore }) {
  if (!config.devOnlyAllowed) throw new Error(MSG.refused);
  // DESIGN CHOICE: info, not warn. The default LOG_LEVEL (info) shows it, and S1's app test counts warn lines (it expects none for a
  // normal start), which this slice may not change. Alternative: warn, and an edit to that test named in the plan.
  logger.info(STARTUP_LINE);

  return async function devStub(req, res, next) {
    try {
      const identity = await identities.findAdminByEmail(config.devStub.userEmail);
      if (!identity) throw httpError(500, MSG.userMissing, { expose: true });
      if (!identity.isActive) throw httpError(500, MSG.userInactive, { expose: true });

      const tenants = tenantsOf((await accessStore.loadForUser(identity.userId)).roles);
      if (tenants.length === 0) throw httpError(500, MSG.noTenant, { expose: true });

      const asked = (req.get(TENANT_HEADER) ?? '').trim();
      let tenantId = tenants[0].tenantId;
      if (asked !== '') {
        const held = TENANT_ID_PATTERN.test(asked)
          ? tenants.find((t) => t.tenantId === Number(asked))
          : undefined;
        if (!held) throw httpError(403, MSG.tenantNotHeld);
        tenantId = held.tenantId;
      }

      req.user = {
        kind: identity.kind,
        userId: identity.userId,
        email: identity.email,
        displayName: identity.displayName,
        uid: identity.firebaseUid,
      };
      req.tenantCompanyID = tenantId;
      req.log = req.log?.child({ userId: identity.userId, kind: identity.kind, tenantId });
      runWithActor(identity.userId, next, { tenantId }); // everything after this, awaited or not, runs in the context
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { createDevStub, STARTUP_LINE, MSG };
