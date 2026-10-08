// tools/verify.js: one line per check, ALL GREEN or the failures, exit code = failure count, and a
// state file after every run (green or red). Run in a scratch copy, so the real .verify/ is never touched.
// The long full run (schema, seed, emulator, Flutter) is shown by hand in the slice report.
'use strict';

const test = require('./timeout');
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

/** The environment for a child verify: this one, minus the parent's node:test context (a child `node --test` would then refuse to run files). */
function childEnv(extra) {
  const env = { ...process.env, ...extra };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

const verify = (dir, args, { env = {}, node = process.execPath, preload } = {}) => {
  const r = spawnSync(
    node,
    [...(preload ? ['-r', preload] : []), path.join(dir, 'tools', 'verify.js'), ...args],
    {
      cwd: dir,
      encoding: 'utf8',
      env: childEnv(env),
    },
  );
  const state = fs.existsSync(path.join(dir, '.verify', 'last-run.json'))
    ? JSON.parse(fs.readFileSync(path.join(dir, '.verify', 'last-run.json'), 'utf8'))
    : null;
  return { status: r.status, out: r.stdout, err: r.stderr, state };
};

test('the checks are the fifteen of plan S5 (+ L126), cheap ones first, the schema before the tests that need it, node-version first and fatal', () => {
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
      'schema-run-1',
      'schema-run-2',
      'api-tests',
      'db-tools-tests',
      'seed',
      'functions-health',
      'flutter-analyze',
      'flutter-test',
    ],
  );
  assert.equal(CHECKS[0].fatal, true);
});

// S7 review I1: verify runs its checks in CHECKS order whatever the order of --only, and api-tests and
// db-tools-tests used to come BEFORE schema-run-1/2. On a fresh database (CI's postgres:18) they failed with
// 'relation "gabay.globalsetting" does not exist'. Anything that needs the schema in the database must come
// after the run that applies it.
test('I1: every check that needs the schema in the database runs after the two schema runs', () => {
  const names = CHECKS.map((c) => c.name);
  const at = (n) => names.indexOf(n);
  for (const needsSchema of ['api-tests', 'db-tools-tests', 'seed', 'functions-health']) {
    assert.ok(at(needsSchema) > at('schema-run-2'), `${needsSchema} runs after schema-run-2`);
  }
  assert.equal(at('schema-run-2'), at('schema-run-1') + 1, 'the two schema runs are back to back');
  for (const cheap of [
    'node-check',
    'structural-linters',
    'linter-tests',
    'tools-tests',
    'eslint',
    'prettier',
  ]) {
    assert.ok(
      at(cheap) < at('schema-run-1'),
      `${cheap} (no database) stays before the schema runs`,
    );
  }
});

test('verify --list and a bad --only', () => {
  const dir = scratch();
  try {
    const mixed = verify(dir, ['--list', '--only', 'node-version']);
    assert.equal(
      mixed.status,
      2,
      '--list with another argument runs nothing, so it must not look like a pass',
    );
    assert.match(mixed.err, /--list takes no other argument/);
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

// ---- S5 review I1: a test glob that matches nothing exits 0 with "# tests 0" ---------------------------

test('a test check that ran no tests fails, however the runner exited (I1)', () => {
  const dir = scratch({
    'package.json': JSON.stringify({
      scripts: { 'lint:test': 'node --test "nomatch/**/*.test.js"' },
    }),
  });
  try {
    const r = verify(dir, ['--only', 'linter-tests']);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /^FAIL linter-tests/m);
    assert.match(r.out, /no tests ran/);
    assert.deepEqual(r.state.failed, ['linter-tests']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a test check passes when tests ran (I1)', () => {
  const dir = scratch({
    'package.json': JSON.stringify({
      scripts: { 'lint:test': 'node --test "tests/**/*.test.js"' },
    }),
    'tests/a.test.js': "require('node:test')('one', () => {});\n",
  });
  try {
    const r = verify(dir, ['--only', 'linter-tests']);
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /^ok\s+linter-tests/m);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- S7 review nit: in CI the log is all there is, so a failing check keeps its whole output ------------

test('a failing check shows its last 30 lines locally and (CI=true) all of its output, so the uploaded log is useful', () => {
  const dir = scratch({
    'package.json': JSON.stringify({ scripts: { 'lint:test': 'node noisy.js' } }),
    'noisy.js':
      "for (let i = 1; i <= 100; i += 1) console.log(`line ${i}`);\nconsole.log('# tests 1');\nprocess.exit(1);\n",
  });
  try {
    const local = verify(dir, ['--only', 'linter-tests'], { env: { CI: '' } });
    assert.equal(local.status, 1, local.out);
    assert.match(local.out, /line 100/);
    assert.doesNotMatch(local.out, /line 50\b/, 'locally only the tail is kept');
    const ci = verify(dir, ['--only', 'linter-tests'], { env: { CI: 'true' } });
    assert.equal(ci.status, 1, ci.out);
    assert.match(ci.out, /line 1\b/, 'in CI the first line is still there');
    assert.match(ci.out, /line 50\b/);
    assert.match(ci.out, /line 100/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- S7 review I4: a check's own timeout must be able to fire before the CI job's timeout -----------------

test('GABAY_VERIFY_CHECK_TIMEOUT_MS caps every check: a hung check fails as TIMED OUT, with its output, and the run goes on', () => {
  const dir = scratch({
    'package.json': JSON.stringify({ scripts: { 'lint:test': 'node hang.js' } }),
    'hang.js':
      "console.log('# tests 1');\nconsole.log('about to hang');\nsetTimeout(() => {}, 120000);\n",
  });
  try {
    const started = Date.now();
    const r = verify(dir, ['--only', 'linter-tests'], {
      // 10 s, not 2: under load the child may need seconds just to start and print before the cap fires.
      env: { GABAY_VERIFY_CHECK_TIMEOUT_MS: '10000' },
    });
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /^FAIL linter-tests/m);
    assert.match(r.out, /TIMED OUT after 10 s/);
    assert.match(r.out, /about to hang/, 'what it printed before hanging is kept');
    assert.ok(Date.now() - started < 60_000, 'it did not wait for the default ten minutes');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// S7 round 2: a cap that is not a positive whole number of milliseconds must stop the run, not be ignored
// (an ignored typo would leave a hung CI check to the job timeout again).
test('GABAY_VERIFY_CHECK_TIMEOUT_MS that is not a positive whole number is rejected with a clear error', () => {
  const dir = scratch();
  try {
    for (const bad of ['abc', '0', '-5', '1.5', '10s']) {
      const r = verify(dir, ['--only', 'node-version'], {
        env: { GABAY_VERIFY_CHECK_TIMEOUT_MS: bad },
      });
      assert.equal(r.status, 2, `${bad}: ${r.out}${r.err}`);
      assert.match(r.err, /GABAY_VERIFY_CHECK_TIMEOUT_MS/);
      assert.ok(r.err.includes(`"${bad}"`), 'the message quotes the bad value');
      assert.doesNotMatch(r.out, /^ok /m, 'no check ran');
    }
    const empty = verify(dir, ['--only', 'node-version'], {
      env: { GABAY_VERIFY_CHECK_TIMEOUT_MS: '' },
    });
    assert.equal(empty.status, 0, 'empty means not set');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
