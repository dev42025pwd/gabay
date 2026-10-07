// Stop hook (main session only, L129): the session may not finish until `npm run verify` has run on
// the CURRENT code. Registered under `Stop`, never `SubagentStop`: coders hand back to the main session,
// which runs verify.
//
//   no verify result, a partial run, or a fingerprint that differs from the code now -> block
//   a result for exactly this code, and it FAILED  -> allow, with a "verify FAILED" notice naming the checks
//                                                      (a failed run must not trap the session: an agent can
//                                                      still stop to ask a question)
//   a result for exactly this code, and it is green -> allow, silently
//
// stop_hook_active does NOT release the block (ruling L129 b): only a run on the current code does.
// The fingerprint comes from tools/fingerprint.js, the module `npm run verify` writes it with.
'use strict';

const { ROOT, readEvent, block, notice } = require('./lib');
const { fingerprint, readState } = require(`${ROOT}/tools/fingerprint.js`);

async function main() {
  await readEvent(); // the event is not needed, but stdin must be drained
  const state = readState(ROOT);
  const now = fingerprint(ROOT);
  const current = state && !state.partial && state.fingerprint === now;
  if (!current) {
    block(
      state
        ? 'Code changed since the last npm run verify. Run it and paste its output.'
        : 'npm run verify has not been run on this code. Run it and paste its output.',
    );
    return;
  }
  if (state.result === 'red') {
    notice(
      `verify FAILED on the current code: ${state.failed.join(', ') || '(no check names recorded)'}`,
    );
  }
}

main();
