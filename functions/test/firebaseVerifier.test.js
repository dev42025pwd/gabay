'use strict';

// P2-S1: the Firebase ID-token verifier (standard §3.3; E-08). Two layers:
//   1. classification: which failures are "your token is no good" (401) and which are "we cannot check right
//      now" (503, fail closed: never a 200 and never a misleading 401);
//   2. the REAL firebase-admin code in emulator mode, against a fake Identity Toolkit server (authHelpers.js), so
//      the SDK's behaviour is exercised, not assumed: unsigned emulator tokens, the project check, expiry, the
//      revocation lookup (it happens on every verify), a disabled user, an unknown user, an unreachable emulator.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createFirebaseVerifier, classifyVerifyError } = require('../src/auth/firebaseVerifier');
const {
  EMULATOR_PROJECT,
  nowSeconds,
  unsignedIdToken,
  fakeIdentityToolkit,
} = require('./authHelpers');

const coded = (code) =>
  Object.assign(new Error(`sdk text for ${code} that must never be shown`), { code });

test('classify: token problems are 401 with a plain message and no SDK text', () => {
  const cases = [
    ['auth/id-token-expired', 'Session expired'],
    ['auth/id-token-revoked', 'Invalid session'],
    ['auth/argument-error', 'Invalid session'],
    ['auth/invalid-id-token', 'Invalid session'],
    ['auth/user-not-found', 'Invalid session'],
    ['auth/user-disabled', 'Account is not active'],
  ];
  for (const [code, message] of cases) {
    const err = classifyVerifyError(coded(code));
    assert.equal(err.httpStatus, 401, code);
    assert.equal(err.message, message, code);
  }
});

test('classify: anything else is 503 "Authentication service unavailable" (fail closed), with no SDK text', () => {
  const unknown = [
    coded('auth/internal-error'),
    coded('app/network-error'),
    coded('auth/something-new'),
    new Error('connect ECONNREFUSED 10.0.0.1:443'),
    'a thrown string',
    null,
    undefined,
  ];
  for (const raw of unknown) {
    const err = classifyVerifyError(raw);
    assert.equal(err.httpStatus, 503, String(raw));
    assert.equal(err.expose, true, 'a 503 here is shown (httpError expose), as a plain message');
    assert.equal(err.message, 'Authentication service unavailable');
  }
});

test('classify: the original error is kept as `cause` for the server log, never as the message', () => {
  const raw = coded('auth/id-token-revoked');
  const err = classifyVerifyError(raw);
  assert.equal(err.cause, raw);
  assert.doesNotMatch(err.message, /sdk text/);
});

/** A verifier on the real SDK, pointed at a fake Identity Toolkit, plus a close() that cleans both up. */
async function sdkVerifier(users, { projectId = EMULATOR_PROJECT } = {}) {
  const toolkit = await fakeIdentityToolkit(users);
  const verifier = createFirebaseVerifier({ projectId, authEmulatorHost: toolkit.host });
  return {
    toolkit,
    verifier,
    async close() {
      await verifier.close();
      await toolkit.close().catch(() => {});
    },
  };
}

test('verifier (real SDK, emulator mode): a good unsigned token gives its claims, and revocation IS checked', async () => {
  const s = await sdkVerifier({ 'uid-1': {} });
  try {
    const iat = nowSeconds() - 30;
    const claims = await s.verifier.verifyIdToken(unsignedIdToken({ uid: 'uid-1', iat }));
    assert.equal(claims.uid, 'uid-1');
    assert.equal(claims.iat, iat);
    assert.equal(claims.auth_time, iat);
    assert.equal(s.toolkit.requests.length, 1, 'one accounts:lookup per verification');
    assert.deepEqual(s.toolkit.requests[0].body, { localId: ['uid-1'] });
  } finally {
    await s.close();
  }
});

test('verifier (real SDK): tokens valid-after the sign-in time are revoked: 401', async () => {
  const authTime = nowSeconds() - 600;
  const s = await sdkVerifier({ 'uid-1': { validSince: String(authTime + 60) } });
  try {
    await assert.rejects(
      s.verifier.verifyIdToken(unsignedIdToken({ uid: 'uid-1', iat: authTime, authTime })),
      (err) => err.httpStatus === 401 && err.message === 'Invalid session',
    );
  } finally {
    await s.close();
  }
});

test('verifier (real SDK): a token signed in after the valid-since time is accepted', async () => {
  const authTime = nowSeconds() - 60;
  const s = await sdkVerifier({ 'uid-1': { validSince: String(authTime - 600) } });
  try {
    const claims = await s.verifier.verifyIdToken(
      unsignedIdToken({ uid: 'uid-1', iat: authTime, authTime }),
    );
    assert.equal(claims.uid, 'uid-1');
  } finally {
    await s.close();
  }
});

test('verifier (real SDK): a user disabled in Firebase is 401 "Account is not active"', async () => {
  const s = await sdkVerifier({ 'uid-1': { disabled: true } });
  try {
    await assert.rejects(
      s.verifier.verifyIdToken(unsignedIdToken({ uid: 'uid-1' })),
      (err) => err.httpStatus === 401 && err.message === 'Account is not active',
    );
  } finally {
    await s.close();
  }
});

test('verifier (real SDK): a user Firebase does not know is 401', async () => {
  const s = await sdkVerifier({});
  try {
    await assert.rejects(
      s.verifier.verifyIdToken(unsignedIdToken({ uid: 'ghost' })),
      (err) => err.httpStatus === 401 && err.message === 'Invalid session',
    );
  } finally {
    await s.close();
  }
});

test('verifier (real SDK): an expired token is 401 "Session expired"', async () => {
  const s = await sdkVerifier({ 'uid-1': {} });
  try {
    const iat = nowSeconds() - 7200;
    await assert.rejects(
      s.verifier.verifyIdToken(unsignedIdToken({ uid: 'uid-1', iat, exp: iat + 3600 })),
      (err) => err.httpStatus === 401 && err.message === 'Session expired',
    );
  } finally {
    await s.close();
  }
});

test('verifier (real SDK): a token from another project, and garbage, are 401 (and no lookup is made)', async () => {
  const s = await sdkVerifier({ 'uid-1': {} });
  try {
    for (const token of [
      unsignedIdToken({ uid: 'uid-1', projectId: 'some-other-project' }),
      'not-a-jwt',
      '',
      'a.b.c',
    ]) {
      await assert.rejects(
        s.verifier.verifyIdToken(token),
        (err) => err.httpStatus === 401,
        `token: ${token.slice(0, 20)}`,
      );
    }
    assert.equal(s.toolkit.requests.length, 0, 'refused before asking Firebase about the user');
  } finally {
    await s.close();
  }
});

test('verifier (real SDK): a non-string token is 401, not a crash', async () => {
  const s = await sdkVerifier({});
  try {
    for (const token of [undefined, null, 42, {}]) {
      await assert.rejects(s.verifier.verifyIdToken(token), (err) => err.httpStatus === 401);
    }
  } finally {
    await s.close();
  }
});

test('verifier (real SDK): when Firebase cannot be reached the answer is 503, not a pass and not a 401', async () => {
  const s = await sdkVerifier({ 'uid-1': {} });
  const token = unsignedIdToken({ uid: 'uid-1' });
  await s.toolkit.close(); // the emulator goes away
  try {
    await assert.rejects(
      s.verifier.verifyIdToken(token),
      (err) => err.httpStatus === 503 && err.message === 'Authentication service unavailable',
    );
  } finally {
    await s.close();
  }
});

test('verifier: two verifiers in one process keep their own emulator (no shared app)', async () => {
  const a = await sdkVerifier({ 'uid-a': {} });
  const b = await sdkVerifier({ 'uid-b': {} });
  try {
    assert.equal((await a.verifier.verifyIdToken(unsignedIdToken({ uid: 'uid-a' }))).uid, 'uid-a');
    assert.equal((await b.verifier.verifyIdToken(unsignedIdToken({ uid: 'uid-b' }))).uid, 'uid-b');
    await assert.rejects(
      a.verifier.verifyIdToken(unsignedIdToken({ uid: 'uid-b' })),
      (e) => e.httpStatus === 401,
    );
  } finally {
    await a.close();
    await b.close();
  }
});

test('verifier: creating one is inert (no network, no app) until the first token arrives; close() is safe twice', async () => {
  const verifier = createFirebaseVerifier({
    projectId: EMULATOR_PROJECT,
    authEmulatorHost: '127.0.0.1:1',
  });
  await verifier.close();
  await verifier.close();
});
