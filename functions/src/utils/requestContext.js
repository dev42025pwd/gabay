// Actor context (standard §3.18, Appendix A.1): services stamp CreatedBy/UpdatedBy with
// getActorId() instead of threading a userId through every call.
// Outside a request (a script, a test, the seed) both getters return null, which correctly
// leaves audit columns NULL.
'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

const als = new AsyncLocalStorage();

/** Runs fn with the actor (and, from Phase 2, the tenant) bound to the current async chain. */
function runWithActor(userId, fn, { tenantId = null } = {}) {
  return als.run({ userId, tenantId }, fn);
}

const getActorId = () => als.getStore()?.userId ?? null;

/**
 * SLOT, filled in Phase 2: the tenant the request acts for, as tenantContext resolves it from the
 * user's UserRole rows (rule 2). Handlers still read req.tenantCompanyID; this is for deep services
 * that have no req. Null until Phase 2 sets it.
 */
const getTenantId = () => als.getStore()?.tenantId ?? null;

/** True inside a request's context (even with no actor yet), false in a script or a test. */
const inRequestContext = () => als.getStore() !== undefined;

module.exports = { runWithActor, getActorId, getTenantId, inRequestContext };
