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
//                                                      ask a question); when .verify/logs/ holds logs, it adds
//                                                      that the full output of each failing check is there
//   a result for exactly this code, and it is green -> allow, silently
//
// WORKING COPIES (owner ruling I-4, plan/PH1-worktrees.md 1.1): it ALWAYS checks the main folder, and also the working
// copy of this repository the event's cwd is in, when there is one; never only the copy. With two folders, each message
// says which folder it is about; with one, the messages are as above.
//
// stop_hook_active does NOT release the block (ruling L129 b): only a run on the current code does.
// The fingerprint comes from tools/fingerprint.js, the module `npm run verify` writes it with.
'use strict';

const fs = require('node:fs');
const { ROOT, stopRoots, folderLabel, readEvent, block, notice } = require('./lib');
// The scripts and this module load from the main folder; what is fingerprinted is each folder checked (below).
const { fingerprint, readStateDetailed } = require(`${ROOT}/tools/fingerprint.js`);

/**
 * True when .verify/logs/ holds a log: a failed run leaves the whole output of each failing check there
 * (tools/lib/verify-logs.js), so the notice can point to it. A failure with no output (code that changed
 * during the run) leaves none, and then there is nothing to point to.
 */
function hasLogs(root) {
  try {
    return fs.readdirSync(`${root}/.verify/logs`).some((name) => name.endsWith('.log'));
  } catch {
    return false;
  }
}

/** What one folder's verify record says: { block: reason }, { notice: text } or {} (green). */
function check(root) {
  const { state, corrupt, unreadable, error } = readStateDetailed(root);
  if (unreadable) {
    // Fail closed: a record that is there but cannot be read (EACCES, EBUSY) is not the same as one never made.
    return {
      block: `The verify record .verify/last-run.json could not be read (${String(error).split('\n')[0]}). Run npm run verify again and paste its output.`,
    };
  }
  if (corrupt) {
    return {
      block: `The verify record .verify/last-run.json is corrupt (${String(error).split('\n')[0]}). Run npm run verify again and paste its output.`,
    };
  }
  let now;
  try {
    now = fingerprint(root);
  } catch (err) {
    // Fail closed: when we cannot tell whether the code changed, the session may not finish on trust.
    return {
      block: `Could not tell whether the code changed since the last verify (${String(err.message).split('\n')[0]}). Run npm run verify and paste its output.`,
    };
  }
  const current = state && !state.partial && state.fingerprint === now;
  if (!current) {
    return {
      block: state
        ? 'Code changed since the last npm run verify. Run it and paste its output.'
        : 'npm run verify has not been run on this code. Run it and paste its output.',
    };
  }
  if (state.result === 'red') {
    const ran = Array.isArray(state.checks) ? state.checks.length : null;
    const progress =
      ran === null
        ? ''
        : `${ran}${state.totalChecks ? ` of ${state.totalChecks}` : ''} checks ran; `;
    const failed = state.failed.join(', ') || '(no check names recorded)';
    const logs = hasLogs(root) ? '; the full output of each failing check is in .verify/logs/' : '';
    return { notice: `verify FAILED on the current code: ${progress}failed: ${failed}${logs}` };
  }
  return {};
}

async function main() {
  // The main folder always, and the working copy the event's cwd is in as well (owner ruling I-4): a copy's green
  // run never excuses the main folder's edits, and a copy's stale run is reported on top.
  const roots = stopRoots(await readEvent());
  const named = (root, text) => (roots.length > 1 ? `In ${folderLabel(root)}: ${text}` : text);
  const blocks = [];
  const notices = [];
  for (const root of roots) {
    const result = check(root);
    if (result.block) blocks.push(named(root, result.block));
    if (result.notice) notices.push(named(root, result.notice));
  }
  if (blocks.length) block(blocks.join(' '));
  else if (notices.length) notice(notices.join(' '));
}

main().catch((err) => {
  // Never an unhandled rejection: block with the reason instead.
  block(
    `The verify check itself failed (${err.message}). Run npm run verify and paste its output.`,
  );
});
