// actorContext (Blueprint order, L126): the slot where the request's actor is bound for the rest of
// the request (standard §3.18, Appendix A.1). The wiring exists now; the actor is still null.
// Phase 2 (sign-in) replaces the null with the verified user's id, once auth has run, and
// tenantContext adds the tenant.
'use strict';

const { runWithActor } = require('../utils/requestContext');

function actorContext(req, res, next) {
  // Everything after this middleware, awaited or not, runs inside the context.
  runWithActor(null, next);
}

module.exports = { actorContext };
