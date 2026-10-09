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
  'tools/lib/verify-logs.js',
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
const verify = (dir, args, { env = {}, node = process.execPath, preload, timeout } = {}) => {
  const r = spawnSync(node, verifyArgs(dir, args, preload), {
    cwd: dir,
    encoding: 'utf8',
    env: childEnv({ GABAY_VERIFY_LOCK_FILE: lockFileOf(dir), ...env }),
    timeout, // a run that never ends is killed (status null) instead of left behind
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

// ---- helpers for the lock tests ----

const NODE = process.execPath;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntil(fn, ms = 20_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await fn()) return true;
    await sleep(50);
  }
  return false;
}

/** A process that stays alive until killed, standing in for another verify. */
function liveHolder() {
  return spawn(NODE, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
}

/** The pid of a process that has already ended. */
async function deadPid() {
  const child = spawn(NODE, ['-e', ''], { stdio: 'ignore' });
  await new Promise((resolve) => child.on('exit', resolve));
  return child.pid;
}

const holderRecord = (pid, over = {}) => ({
  token: `test-${pid}`,
  owner: 'api-coder',
  pid,
  folder: 'C:\\work\\gabay-a',
  commit: 'abc1234',
  startedAt: '2026-10-08T01:02:03.000Z',
  ...over,
});

const writeLock = (dir, record) => fs.writeFileSync(lockFileOf(dir), JSON.stringify(record));
const readLock = (dir) => JSON.parse(fs.readFileSync(lockFileOf(dir), 'utf8'));
const lockExists = (dir) => fs.existsSync(lockFileOf(dir));
const clean = (dir) => fs.rmSync(dir, { recursive: true, force: true });

/**
 * Test cleanup only (the owner's ruling L163, as for verify-lock-fix.test.js): deletes a scratch folder whose file a
 * PowerShell helper held open. The helper's exit and the OS letting go of the handle are not the same instant under a
 * full verify's load, so a delete that meets EBUSY or EPERM is retried every 50 ms, for at most `withinMs`, instead of
 * failing the test after a fixed sleep.
 */
async function cleanWhenFree(folder, withinMs = 5_000) {
  const until = Date.now() + withinMs;
  for (;;) {
    try {
      clean(folder);
      return;
    } catch (err) {
      if (!['EBUSY', 'EPERM'].includes(err.code) || Date.now() >= until) throw err;
      await sleep(50);
    }
  }
}

/** A scratch path outside the scratch repo, for what a check wants to tell its test. */
const seenFile = (name) =>
  path.join(os.tmpdir(), `gabay-lock-${name}-${process.pid}-${Date.now()}.json`);

/**
 * A check ("linter-tests") that notes whether the lock was held while it ran (copying it to `seen`), then ends
 * with `exitCode`, after sleeping `napMs`.
 */
const noteLockCheck = (seen, { exitCode = 0, napMs = 0 } = {}) => ({
  'package.json': JSON.stringify({ scripts: { 'lint:test': 'node peek.js' } }),
  'peek.js': `const fs = require('fs');
fs.copyFileSync(process.env.GABAY_VERIFY_LOCK_FILE, ${JSON.stringify(seen)});
console.log('# tests 1');
setTimeout(() => process.exit(${exitCode}), ${napMs});
`,
});

/** A check that sleeps `ms`, then passes (the "# tests 1" line is what the tests check wants). */
const sleepingCheck = (ms) => ({
  'package.json': JSON.stringify({ scripts: { 'lint:test': 'node nap.js' } }),
  'nap.js': `console.log('# tests 1'); setTimeout(() => {}, ${ms});\n`,
});

module.exports = {
  scratch,
  verify,
  startVerify,
  childEnv,
  lockFileOf,
  VERIFY_FILES,
  sleep,
  waitUntil,
  liveHolder,
  deadPid,
  holderRecord,
  writeLock,
  readLock,
  lockExists,
  clean,
  cleanWhenFree,
  seenFile,
  noteLockCheck,
  sleepingCheck,
};
