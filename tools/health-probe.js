// The Functions emulator health probe, run by `npm run verify` inside `firebase emulators:exec`
// (L126): GET /api/health must answer { status: "ok", db: "ok" } with an X-Request-Id header.
// It polls until the function answers or HEALTH_TIMEOUT_MS passes, so a slow start is not a failure.
// Exit 0 = healthy, 1 = not. Plain CommonJS, no dependencies.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const HEALTH_TIMEOUT_MS = 90_000;
const POLL_MS = 1_000;

/** The URL the emulator serves the function at, from firebase.json (port) and the function's region. */
function healthUrl(root = path.resolve(__dirname, '..')) {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
  const { host = '127.0.0.1', port = 5001 } = config.emulators?.functions ?? {};
  return `http://${host}:${port}/demo-gabay/asia-southeast1/api/api/health`;
}

/** @returns {Promise<{ ok: boolean, detail: string }>} one attempt */
async function probeOnce(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    const body = await res.json().catch(() => null);
    const id = res.headers.get('x-request-id');
    if (res.status !== 200)
      return { ok: false, detail: `HTTP ${res.status} ${JSON.stringify(body)}` };
    if (body?.status !== 'ok' || body?.db !== 'ok')
      return { ok: false, detail: `unexpected body ${JSON.stringify(body)}` };
    if (!id) return { ok: false, detail: 'no X-Request-Id header' };
    return { ok: true, detail: `200 ${JSON.stringify(body)} X-Request-Id: ${id}` };
  } catch (err) {
    return { ok: false, detail: `not answering yet: ${err.message}` };
  }
}

async function main() {
  const url = healthUrl();
  const until = Date.now() + HEALTH_TIMEOUT_MS;
  let last = { ok: false, detail: 'never tried' };
  while (Date.now() < until) {
    last = await probeOnce(url);
    // A wrong answer from a running function will not improve by waiting; only "not answering" is retried.
    if (last.ok || !last.detail.startsWith('not answering')) break;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  console.log(`GET ${url}\n${last.ok ? 'healthy' : 'UNHEALTHY'}: ${last.detail}`);
  process.exit(last.ok ? 0 : 1);
}

if (require.main === module) main();

module.exports = { healthUrl, probeOnce };
