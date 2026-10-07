// Shared by the Claude Code hooks in this folder. Plain CommonJS, no dependencies, any Node >= 22
// (the machine's default Node is 24; hooks are not run through fnm).
//
// Hook protocol, from code.claude.com/docs/en/hooks (checked 2026-10-07): the event arrives as JSON on
// stdin (session_id, cwd, hook_event_name, ...). To block, exit 2 with the reason on stderr, or exit 0
// with {"decision":"block","reason":...} on stdout. {"systemMessage": ...} shows a notice to the user
// without blocking.
'use strict';

const path = require('node:path');

/** The repository root: where these hooks live (.claude/hooks/..). */
const ROOT = path.resolve(__dirname, '..', '..');

/** The event JSON from stdin ({} when there is none or it is not JSON). */
function readEvent() {
  return new Promise((resolve) => {
    let data = '';
    if (process.stdin.isTTY) return resolve({});
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch {
        resolve({});
      }
    });
    process.stdin.on('error', () => resolve({}));
  });
}

/** The session baseline file (HEAD when the session began), under the gitignored .verify/. */
const baselineFile = (id) =>
  path.join(ROOT, '.verify', `session-${String(id).replace(/[^A-Za-z0-9_-]/g, '_')}.json`);

const block = (reason) => console.log(JSON.stringify({ decision: 'block', reason }));
const notice = (systemMessage) => console.log(JSON.stringify({ systemMessage }));

module.exports = { ROOT, readEvent, baselineFile, block, notice };
