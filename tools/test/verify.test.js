// tools/verify.js: one line per check, ALL GREEN or the failures, exit code = failure count, and a
// state file after every run (green or red). Run in a scratch copy, so the real .verify/ is never touched.
// The long full run (schema, seed, emulator, Flutter) is shown by hand in the slice report.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { REAL } = require('./scratch');
const { CHECKS } = require('../verify');

/** A git repo holding verify.js and its modules, plus the given extra files. */
function scratch(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gabay-verify-'));
  for (const rel of [
    'tools/verify.js',
    'tools/fingerprint.js',
    'tools/lib/proc.js',
    'tools/health-probe.js',
  ]) {
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

const verify = (dir, args, { env = {}, node = process.execPath, preload } = {}) => {
  const r = spawnSync(
    node,
    [...(preload ? ['-r', preload] : []), path.join(dir, 'tools', 'verify.js'), ...args],
    {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    },
  );
  const state = fs.existsSync(path.join(dir, '.verify', 'last-run.json'))
    ? JSON.parse(fs.readFileSync(path.join(dir, '.verify', 'last-run.json'), 'utf8'))
    : null;
  return { status: r.status, out: r.stdout, err: r.stderr, state };
};

test('the checks are the fifteen of plan S5 (+ L126), cheap ones first, node-version first and fatal', () => {
  assert.deepEqual(
    CHECKS.map((c) => c.name),
    [
      'node-version',
      'node-check',
      'structural-linters',
      'linter-tests',
      'tools-tests',
      'eslint',
      'prettier',
      'api-tests',
      'db-tools-tests',
      'schema-run-1',
      'schema-run-2',
      'seed',
      'functions-health',
      'flutter-analyze',
      'flutter-test',
    ],
  );
  assert.equal(CHECKS[0].fatal, true);
});

test('verify --list and a bad --only', () => {
  const dir = scratch();
  try {
    assert.equal(verify(dir, ['--list']).out.trim().split('\n').length, 15);
    const bad = verify(dir, ['--only', 'nope']);
    assert.equal(bad.status, 2);
    assert.match(bad.err, /unknown: nope/);
    assert.equal(verify(dir, ['--only']).status, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a green run prints one line per check, ends ALL GREEN, exits 0 and records a green state with the fingerprint', () => {
  const dir = scratch({ 'tools/lint/run.js': "console.log('ok   repo-layout');\n" });
  try {
    const r = verify(dir, ['--only', 'node-version,node-check,structural-linters']);
    assert.equal(r.status, 0, r.out + r.err);
    assert.match(r.out, /^ok[ ]+node-version\s+\(\d+\.\d s\)$/m);
    assert.match(r.out, /^ok[ ]+node-check\s+\(/m);
    assert.match(r.out, /ALL GREEN/);
    assert.equal(r.state.result, 'green');
    assert.equal(r.state.partial, true, '--only is a partial run');
    assert.deepEqual(r.state.failed, []);
    assert.match(r.state.fingerprint, /^[0-9a-f]{64}$/);
    assert.deepEqual(
      r.state.checks.map((c) => c.name),
      ['node-version', 'node-check', 'structural-linters'],
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a red run lists the failures, has no ALL GREEN, exits with the failure count and records a red state', () => {
  // A syntax error (node-check), and a linter run that cannot find its runner (structural-linters).
  const dir = scratch({ 'functions/src/broken.js': 'const = ;\n' });
  try {
    const r = verify(dir, ['--only', 'node-version,node-check,structural-linters']);
    assert.equal(r.status, 2, r.out);
    assert.match(r.out, /^FAIL node-check/m);
    assert.match(r.out, /^FAIL structural-linters/m);
    assert.match(r.out, /functions\/src\/broken\.js/, 'the failing file is named');
    assert.match(r.out, /2 FAILED: node-check, structural-linters/);
    assert.doesNotMatch(r.out, /ALL GREEN/);
    assert.equal(r.state.result, 'red');
    assert.deepEqual(r.state.failed, ['node-check', 'structural-linters']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the structural linters check fails when the repo-layout line is missing, even if the runner exits 0', () => {
  const dir = scratch({ 'tools/lint/run.js': "console.log('ok   schema-drops');\n" });
  try {
    const r = verify(dir, ['--only', 'structural-linters']);
    assert.equal(r.status, 1);
    assert.match(r.out, /"ok[ ]+repo-layout" line is missing/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a wrong Node major fails node-version and stops: nothing after it runs', () => {
  const dir = scratch();
  const preload = path.join(dir, 'fake-node.js');
  fs.writeFileSync(
    preload,
    "Object.defineProperty(process.versions, 'node', { value: '24.1.0' });\n",
  );
  try {
    const r = verify(dir, ['--only', 'node-version,node-check'], { preload });
    assert.equal(r.status, 1);
    assert.match(r.out, /^FAIL node-version/m);
    assert.match(r.out, /needs Node 22/);
    assert.doesNotMatch(r.out, /node-check/);
    assert.deepEqual(r.state.failed, ['node-version']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the recorded fingerprint is the one tools/fingerprint.js computes for the code that was verified', () => {
  const dir = scratch({ 'tools/lint/run.js': "console.log('ok   repo-layout');\n" });
  try {
    const r = verify(dir, ['--only', 'node-version']);
    const { fingerprint } = require(path.join(dir, 'tools', 'fingerprint.js'));
    assert.equal(r.state.fingerprint, fingerprint(dir));
    fs.appendFileSync(path.join(dir, 'tools', 'lint', 'run.js'), '// edited\n');
    assert.notEqual(r.state.fingerprint, fingerprint(dir));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a check that changes code (or an edit during the run) makes the run fail: the result would not describe the code', () => {
  const dir = scratch({
    'functions/src/x.js': "'use strict';\n",
    // The "linter run" rewrites a code file, as a generator or an editor mid-run would.
    'tools/lint/run.js': [
      "const fs = require('fs');",
      "const path = require('path');",
      "fs.appendFileSync(path.join(__dirname, '..', '..', 'functions', 'src', 'x.js'), '// changed\\n');",
      "console.log('ok   repo-layout');",
      '',
    ].join('\n'),
  });
  try {
    const r = verify(dir, ['--only', 'structural-linters']);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /^FAIL code-changed-during-run/m);
    assert.deepEqual(r.state.failed, ['code-changed-during-run']);
    assert.equal(r.state.result, 'red');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
