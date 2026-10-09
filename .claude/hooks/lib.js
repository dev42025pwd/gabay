// Shared by the Claude Code hooks in this folder. Plain CommonJS, no dependencies, any Node >= 22
// (the machine's default Node is 24; hooks are not run through fnm).
//
// Hook protocol, from code.claude.com/docs/en/hooks (checked 2026-10-07): the event arrives as JSON on
// stdin (session_id, cwd, hook_event_name, ...). To block, exit 2 with the reason on stderr, or exit 0
// with {"decision":"block","reason":...} on stdout. {"systemMessage": ...} shows a notice to the user
// without blocking.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

/**
 * The repository the hook SCRIPTS live in (.claude/hooks/..): the main folder. $CLAUDE_PROJECT_DIR stays at the
 * folder the session started in (code.claude.com/docs/en/worktrees, checked 2026-10-09), so the scripts always load
 * from here. What a hook CHECKS is hookRoot(event), which may be a coder's working copy (plan/PH1-worktrees.md 1.1).
 */
const ROOT = path.resolve(__dirname, '..', '..');

/** The top level of the repository that holds `dir`, or null when `dir` is in none (or git cannot say). */
function topLevel(dir) {
  try {
    const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: dir,
      encoding: 'utf8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out ? path.resolve(out) : null;
  } catch {
    return null;
  }
}

/** `dir` or its nearest parent that exists (a file just written may sit in a folder git has not seen yet). */
function nearestExisting(dir) {
  let current = dir;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return current;
}

/**
 * The repository a hook should check (plan/PH1-worktrees.md 1.1, point 8). An edit hook takes the edited file's own
 * repository (tool_input.file_path, resolved against the event's cwd when relative); a hook with no file (Stop,
 * SessionStart) takes the event's cwd, which is the root of the working copy Claude is in. With neither, or when
 * neither is inside a repository, it is ROOT, as before.
 */
function hookRoot(event = {}) {
  const file = event.tool_input?.file_path ?? event.tool_response?.filePath;
  if (typeof file === 'string' && file) {
    const absolute = path.resolve(event.cwd || ROOT, file);
    const folder = nearestExisting(path.dirname(absolute));
    const found = folder && topLevel(folder);
    if (found) return found;
  }
  if (typeof event.cwd === 'string' && event.cwd) {
    const folder = nearestExisting(path.resolve(event.cwd));
    const found = folder && topLevel(folder);
    if (found) return found;
  }
  return ROOT;
}

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

module.exports = { ROOT, hookRoot, readEvent, baselineFile, block, notice };
