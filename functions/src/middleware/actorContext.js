// actorContext (Blueprint order, L126): the slot where the request's actor is bound for the rest of
// the request (standard §3.18, Appendix A.1). It opens the context with no actor; the auth middleware (P2-S1) runs
// later, per route group, and re-binds the verified user's id with runWithActor for everything after it. tenantContext
// (S2) adds the tenant the same way.
'use strict';

const { runWithActor } = require('../utils/requestContext');

function actorContext(req, res, next) {
  // Everything after this middleware, awaited or not, runs inside the context.
  runWithActor(null, next);
}

module.exports = { actorContext };
