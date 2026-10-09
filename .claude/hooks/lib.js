// Shared by the Claude Code hooks in this folder. Plain CommonJS, no dependencies, any Node >= 22
// (the machine's default Node is 24; hooks are not run through fnm).
//
// Hook protocol, from code.claude.com/docs/en/hooks (checked 2026-10-07): the event arrives as JSON on
// stdin (session_id, cwd, hook_event_name, ...). To block, exit 2 with the reason on stderr, or exit 0
// with {"decision":"block","reason":...} on stdout. {"systemMessage": ...} shows a notice to the user
// without blocking.
'use strict';

const crypto = require('node:crypto');
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
 * The repository an EDIT hook checks (plan/PH1-worktrees.md 1.1, point 8): the edited file's own repository
 * (tool_input.file_path, resolved against the event's cwd when relative); when the file is in no repository, the
 * event's cwd's; with neither, ROOT, as before. The Stop and SessionStart hooks use stopRoots instead.
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

/** True when two paths are the same folder (case-insensitive on Windows; symbolic links and short names resolved). */
function sameFolder(a, b) {
  const norm = (p) => {
    let full;
    try {
      full = fs.realpathSync.native(p);
    } catch {
      full = path.resolve(p);
    }
    return process.platform === 'win32' ? full.toLowerCase() : full;
  };
  return norm(a) === norm(b);
}

/** The git directory shared by every working copy of a repository (`git rev-parse --git-common-dir`), or null. */
function commonGitDir(dir) {
  try {
    const out = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
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

/**
 * The folders a Stop or SessionStart hook checks (owner ruling I-4, plan/PH1-worktrees.md 1.1): ALWAYS the main
 * folder, ROOT, as before; and, when the event's cwd is in a different working copy of this same repository, that
 * copy as well. Never only the copy: the main session's edits in the main folder are checked whatever folder its shell
 * is in. A cwd in no repository, in an unrelated repository, or in ROOT adds nothing.
 */
function stopRoots(event = {}) {
  const roots = [ROOT];
  if (typeof event.cwd !== 'string' || !event.cwd) return roots;
  const folder = nearestExisting(path.resolve(event.cwd));
  const top = folder && topLevel(folder);
  if (!top || sameFolder(top, ROOT)) return roots;
  const common = commonGitDir(top);
  const ours = commonGitDir(ROOT);
  if (common && ours && sameFolder(common, ours)) roots.push(top);
  return roots;
}

/** How a message names a folder when two are checked: the main folder, or a working copy with its path. */
const folderLabel = (root) => (root === ROOT ? 'the main folder' : `the working copy ${root}`);

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

/**
 * The session baseline file (HEAD when the session began), under the main folder's gitignored .verify/. The main
 * folder's is session-<id>.json; a working copy has its own, session-<id>.copy-<hash of its path>.json, because a
 * copy's HEAD is not the main folder's.
 */
function baselineFile(id, root = ROOT) {
  const name = String(id).replace(/[^A-Za-z0-9_-]/g, '_');
  const suffix =
    root === ROOT
      ? ''
      : `.copy-${crypto.createHash('sha1').update(path.resolve(root).toLowerCase()).digest('hex').slice(0, 10)}`;
  return path.join(ROOT, '.verify', `session-${name}${suffix}.json`);
}

const block = (reason) => console.log(JSON.stringify({ decision: 'block', reason }));
const notice = (systemMessage) => console.log(JSON.stringify({ systemMessage }));

module.exports = {
  ROOT,
  hookRoot,
  stopRoots,
  folderLabel,
  readEvent,
  baselineFile,
  block,
  notice,
};
