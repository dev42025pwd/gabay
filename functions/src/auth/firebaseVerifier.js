// The one place that talks to firebase-admin (E-08, E-09): verifies a Firebase ID token and says why it refuses one.
//
// What the installed firebase-admin 14.5.0 does (read from lib/auth/base-auth.js, token-verifier.js, jwt.js and
// auth-api-request.js, not from memory):
//   - verifyIdToken(token, checkRevoked): checks the token's content (issuer, audience = project ID, subject), its
//     signature (Google's certificates) and expiry; with checkRevoked it then calls accounts:lookup for the user and
//     refuses a disabled user or a token whose auth_time is older than the user's tokensValidAfterTime.
//   - the Auth emulator is found ONLY through the FIREBASE_AUTH_EMULATOR_HOST environment variable, read when the
//     Auth service is created (getAuth). In emulator mode the signature check accepts unsigned tokens (alg "none")
//     and the revocation check runs on every verification whether asked for or not.
//   - failures are FirebaseAuthError with a `code` such as auth/id-token-expired, auth/id-token-revoked,
//     auth/user-disabled, auth/user-not-found, auth/argument-error; transport failures carry other codes.
// Revocation is asked for explicitly here, so production behaves as the emulator does (plan/PH2-identity.md S1).
//
// The app and the Auth service are created on the first token, not when this module loads or when createApp runs:
// loading the API must stay inert (functions/index.js), and a test that never sends a token never makes an app.
'use strict';

const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { httpError } = require('../utils/errors');

/** Firebase error codes that mean "this token is no good", with what the client is told. Everything else is 503. */
const TOKEN_REFUSALS = new Map([
  ['auth/id-token-expired', 'Session expired'],
  ['auth/id-token-revoked', 'Invalid session'],
  ['auth/argument-error', 'Invalid session'],
  ['auth/invalid-id-token', 'Invalid session'],
  ['auth/user-not-found', 'Invalid session'],
  ['auth/user-disabled', 'Account is not active'],
]);
const UNAVAILABLE = 'Authentication service unavailable';

/**
 * Turns whatever the SDK threw into the API's error. A refusal of the token is 401 with a plain message; anything
 * we do not recognise (network, quota, a bug, a future code) is 503 and the token is NOT accepted: failing closed.
 * The SDK's text names documentation URLs and project IDs, so it is kept as `cause` for the log, never shown.
 */
function classifyVerifyError(err) {
  const message = typeof err?.code === 'string' ? TOKEN_REFUSALS.get(err.code) : undefined;
  const out = message ? httpError(401, message) : httpError(503, UNAVAILABLE, { expose: true });
  out.cause = err;
  return out;
}

let appCounter = 0;

/**
 * @param {{projectId: string|null, authEmulatorHost: string|null}} firebase  config.firebase
 * @returns {{verifyIdToken: (token: unknown) => Promise<object>, close: () => Promise<void>}}
 */
function createFirebaseVerifier({ projectId, authEmulatorHost }) {
  let app = null;
  let auth = null;

  function service() {
    if (!auth) {
      // The SDK reads the emulator host ONLY from this process-wide environment variable, at getAuth() time (see the
      // header), so setting it affects the whole process, not just this verifier. That is safe here because config
      // only ever gives a host under an explicit NODE_ENV of development or test (config/index.js, ruling I1), and
      // every verifier in a process shares one config. It is left set: later Auth calls read it too.
      if (authEmulatorHost) process.env.FIREBASE_AUTH_EMULATOR_HOST = authEmulatorHost;
      appCounter += 1; // one named app per verifier: two verifiers in one process (tests) never share state
      app = initializeApp(projectId ? { projectId } : {}, `gabay-auth-${appCounter}`);
      auth = getAuth(app);
    }
    return auth;
  }

  return {
    /** @returns the decoded claims (uid, iat, auth_time, ...) or throws httpError(401 | 503). */
    async verifyIdToken(token) {
      try {
        return await service().verifyIdToken(token, true); // true: check revocation, always
      } catch (err) {
        throw classifyVerifyError(err);
      }
    },
    async close() {
      if (!app) return;
      const closing = app;
      app = null;
      auth = null;
      await deleteApp(closing);
    },
  };
}

module.exports = { createFirebaseVerifier, classifyVerifyError, TOKEN_REFUSALS };
