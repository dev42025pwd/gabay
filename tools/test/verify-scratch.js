// Test helpers shared by the verify tests: a scratch git repo holding verify.js and its modules, and a way to
// run that copy of verify. Every run gets its OWN lock file inside the scratch folder (GABAY_VERIFY_LOCK_FILE),
// so a test never touches the machine's real verify lock and never waits for a real verify. Plain CommonJS.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { REAL } = require('./scratch');

/** The files of the real repo a scratch copy of verify needs. */
const VERIFY_FILES = [
  'tools/verify.js',
  'tools/fingerprint.js',
  'tools/lib/proc.js',
  'tools/lib/verify-lock.js',
  'tools/health-probe.js',
];

/** A git repo holding verify.js and its modules, plus the given extra files. */
function scratch(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gabay-verify-'));
  for (const rel of VERIFY_FILES) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.copyFileSync(path.join(REAL, rel), path.join(dir, rel));
  }
  fs.writeFileSync(path.join(dir, '.gitignore'), '.verify/\nnode_modules/\n');
  fs.writeFileSync(path.join(dir, 'firebase.json'), '{}\n');
  for (const [rel, content] of Object.entries(extra)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  const git = (...args) =>
    spawnSync('git', ['-c', 'user.email=t@e.test', '-c', 'user.name=T', ...args], { cwd: dir });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'x');
  return dir;
}

/** The scratch folder's own lock file (never the machine's). */
const lockFileOf = (dir) => path.join(dir, 'test-verify.lock');

/**
 * The environment for a child verify: this one, minus the parent's node:test context (a child `node --test`
 * would then refuse to run files), minus the lock settings of whoever runs the tests (a real GABAY_VERIFY_OWNER
 * or CI would change what is tested: CI is set to empty), plus the given values.
 */
function childEnv(extra) {
  const env = { ...process.env };
  for (const key of ['GABAY_VERIFY_OWNER', 'GABAY_VERIFY_LOCK_WAIT_MS', 'GABAY_VERIFY_LOCK_FILE']) {
    delete env[key];
  }
  delete env.NODE_TEST_CONTEXT;
  // CI='' unless a test says otherwise: on GitHub CI=true is set, and verify takes no lock there.
  return { ...env, CI: '', ...extra };
}

const verifyArgs = (dir, args, preload) => [
  ...(preload ? ['-r', preload] : []),
  path.join(dir, 'tools', 'verify.js'),
  ...args,
];

const readState = (dir) =>
  fs.existsSync(path.join(dir, '.verify', 'last-run.json'))
    ? JSON.parse(fs.readFileSync(path.join(dir, '.verify', 'last-run.json'), 'utf8'))
    : null;

/** Runs the scratch copy of verify to its end. */
const verify = (dir, args, { env = {}, node = process.execPath, preload } = {}) => {
  const r = spawnSync(node, verifyArgs(dir, args, preload), {
    cwd: dir,
    encoding: 'utf8',
    env: childEnv({ GABAY_VERIFY_LOCK_FILE: lockFileOf(dir), ...env }),
  });
  return { status: r.status, out: r.stdout, err: r.stderr, state: readState(dir) };
};

/**
 * Starts the scratch copy of verify and returns at once: { child, output(), done } where done resolves to
 * { status, signal, out, err, state } when it ends. For tests that need two runs alive together.
 */
function startVerify(dir, args, { env = {} } = {}) {
  const child = spawn(process.execPath, verifyArgs(dir, args), {
    cwd: dir,
    env: childEnv({ GABAY_VERIFY_LOCK_FILE: lockFileOf(dir), ...env }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  let err = '';
  child.stdout.on('data', (c) => (out += c));
  child.stderr.on('data', (c) => (err += c));
  const done = new Promise((resolve) => {
    child.on('close', (status, signal) =>
      resolve({ status, signal, out, err, state: readState(dir) }),
    );
  });
  return { child, output: () => ({ out, err }), done };
}

module.exports = { scratch, verify, startVerify, childEnv, lockFileOf, VERIFY_FILES };
