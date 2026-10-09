// auth (Blueprint order: requestId -> actorContext -> rate limit -> AUTH -> tenantContext -> authorize -> validate ->
// handler; standard §3.3; E-08). Verifies the Firebase ID token in `Authorization: Bearer <token>`, maps its UID to a
// Gabay account, refuses an inactive one, and binds the user id as the request's actor for everything after it.
//
// Which status for which refusal (§3.8; plan/PH2-identity.md Q5: a 401 is what ends a session on the client):
//   no or malformed header; a bad, expired or revoked token; a token older than the limit; an inactive user   401
//   a valid Firebase identity with no Gabay account (or a shopper on an admin route)                          403
//   Firebase or the database cannot be reached                                                                503
// The tenant is NOT decided here and never comes from the token (rule 2): req.user has no tenant. tenantContext (S2)
// reads X-Tenant-Id and checks it against the user's UserRole rows.
'use strict';

const { httpError } = require('../utils/errors');
const { runWithActor } = require('../utils/requestContext');
const { DEFAULTS } = require('../config/settings');

const MAX_AGE_SETTING = 'auth.idTokenMaxAgeS';
const BEARER = /^Bearer ([^\s]+)$/i;

const MSG = Object.freeze({
  required: 'Authentication required',
  expired: 'Session expired',
  invalid: 'Invalid session',
  inactive: 'Account is not active',
  noAccess: 'This account has no access',
});

/** The configured limit when it is a positive finite number, else the default: a bad setting never locks everyone out. */
async function maxTokenAgeS(settings) {
  const value = await settings.getSetting(MAX_AGE_SETTING, null); // the platform: no tenant is chosen yet
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : DEFAULTS[MAX_AGE_SETTING];
}

/**
 * @param {object} deps
 * @param {{verifyIdToken: (token: string) => Promise<{uid: string, auth_time?: number}>}} deps.verifier
 * @param {{findByFirebaseUid: (uid: string) => Promise<object|null>}} deps.identities
 * @param {{getSetting: (key: string, tenantId: null) => Promise<unknown>}} deps.settings
 * @param {() => number} [deps.now]  milliseconds, injected so a test fixes the clock
 */
function createAuth({ verifier, identities, settings, now = Date.now }) {
  return async function auth(req, res, next) {
    try {
      const match = BEARER.exec(req.get('authorization') ?? '');
      if (!match) throw httpError(401, MSG.required);

      const claims = await verifier.verifyIdToken(match[1]); // throws 401 (token) or 503 (Firebase unreachable)

      // Age is the time since SIGN-IN (auth_time, which a token refresh does not change), not since this token was
      // issued (iat): the setting is the session length (owner's ruling I3). A token with no auth_time is refused
      // (fail closed). One from the future (clock skew) has a negative age and passes.
      if (typeof claims.auth_time !== 'number' || !Number.isFinite(claims.auth_time)) {
        throw httpError(401, MSG.invalid);
      }
      const ageS = now() / 1000 - claims.auth_time;
      if (ageS > (await maxTokenAgeS(settings))) throw httpError(401, MSG.expired);

      const identity = await identities.findByFirebaseUid(claims.uid);
      if (!identity) throw httpError(403, MSG.noAccess);
      if (identity.kind === 'admin' && !identity.isActive) throw httpError(401, MSG.inactive);

      // Only what a handler may rely on. No tenant, and no token claim beyond the UID (rule 2).
      const { isActive: _isActive, ...rest } = identity;
      req.user = { ...rest, uid: claims.uid };
      req.log = req.log?.child({ userId: req.user.userId ?? null, kind: req.user.kind });

      // The audit columns hold AppUser ids, so a shopper has no actor.
      const actorId = req.user.kind === 'admin' ? req.user.userId : null;
      runWithActor(actorId, next); // everything after this, awaited or not, runs with the actor bound
    } catch (err) {
      next(err);
    }
  };
}

/** Admin routes accept only an AppUser (Q12). A shopper is signed in but has no business here: 403. */
function requireAdminUser(req, res, next) {
  if (!req.user) return next(httpError(401, MSG.required)); // auth was not mounted before this: never a pass
  if (req.user.kind !== 'admin') return next(httpError(403, MSG.noAccess));
  return next();
}

module.exports = { createAuth, requireAdminUser, MSG };
