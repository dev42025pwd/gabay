// Stop hook (main session only, L129): the session may not finish until `npm run verify` has run on
// the CURRENT code. Registered under `Stop`, never `SubagentStop`: coders hand back to the main session,
// which runs verify.
//
//   the record is there but corrupt, or cannot be read (EACCES, EBUSY) -> block, saying which and naming the
//                                                      error (not "has not been run")
//   no verify result, a partial run, or a fingerprint that differs from the code now -> block
//   the fingerprint cannot be computed (git failed)  -> block, naming the error (fail closed)
//   a result for exactly this code, and it FAILED  -> allow, with a "verify FAILED" notice that says how
//                                                      many checks ran and which failed (a failed run must
//                                                      not trap the session: an agent can still stop to
//                                                      ask a question)
//   a result for exactly this code, and it is green -> allow, silently
//
// stop_hook_active does NOT release the block (ruling L129 b): only a run on the current code does.
// The fingerprint comes from tools/fingerprint.js, the module `npm run verify` writes it with.
'use strict';

const { ROOT, readEvent, block, notice } = require('./lib');
const { fingerprint, readStateDetailed } = require(`${ROOT}/tools/fingerprint.js`);

async function main() {
  await readEvent(); // the event is not needed, but stdin must be drained
  const { state, corrupt, unreadable, error } = readStateDetailed(ROOT);
  if (unreadable) {
    // Fail closed: a record that is there but cannot be read (EACCES, EBUSY) is not the same as one never made.
    block(
      `The verify record .verify/last-run.json could not be read (${String(error).split('\n')[0]}). Run npm run verify again and paste its output.`,
    );
    return;
  }
  if (corrupt) {
    block(
      `The verify record .verify/last-run.json is corrupt (${String(error).split('\n')[0]}). Run npm run verify again and paste its output.`,
    );
    return;
  }
  let now;
  try {
    now = fingerprint(ROOT);
  } catch (err) {
    // Fail closed: when we cannot tell whether the code changed, the session may not finish on trust.
    block(
      `Could not tell whether the code changed since the last verify (${String(err.message).split('\n')[0]}). Run npm run verify and paste its output.`,
    );
    return;
  }
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
    const ran = Array.isArray(state.checks) ? state.checks.length : null;
    const progress =
      ran === null
        ? ''
        : `${ran}${state.totalChecks ? ` of ${state.totalChecks}` : ''} checks ran; `;
    const failed = state.failed.join(', ') || '(no check names recorded)';
    notice(`verify FAILED on the current code: ${progress}failed: ${failed}`);
  }
}

main().catch((err) => {
  // Never an unhandled rejection: block with the reason instead.
  block(
    `The verify check itself failed (${err.message}). Run npm run verify and paste its output.`,
  );
});
