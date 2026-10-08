// tools/ci-migrations.js: lint.yml's check that a committed migration is never edited, on pull requests
// AND on pushes (S7 review I2: it used to run only on pull requests, so a push to main, or a cancelled pull-request
// run, was green without it). Scratch repositories; origin/main is simulated with update-ref, as a full checkout has it.
'use strict';

const test = require('./timeout');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { scratchRepo, git, write, remove } = require('./scratch');

const ZEROS = '0'.repeat(40);
const LAYOUT = {
  'db/schema.sql': '-- x\n',
  'app/lib/x.dart': '// x\n',
  'functions/src/x.js': '// x\n',
};
const MIGRATION = 'db/migrations/0001_first.sql';

/** A repo whose main holds a committed migration; origin/main points at it. */
function withRepo(fn) {
  const dir = scratchRepo({ ...LAYOUT, [MIGRATION]: 'SELECT 1;\n' });
  git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  try {
    return fn(dir);
  } finally {
    remove(dir);
  }
}

const head = (dir) => git(dir, ['rev-parse', 'HEAD']).out.trim();

function commit(dir, files, message = 'change') {
  for (const [rel, content] of Object.entries(files)) write(dir, rel, content);
  git(dir, ['add', '-A']);
  const r = git(dir, ['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', message]);
  assert.equal(r.status, 0, r.all);
}

const run = (dir, env) => {
  const r = spawnSync(process.execPath, [path.join(dir, 'tools', 'ci-migrations.js')], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, EVENT_NAME: '', BASE_REF: '', BEFORE_SHA: '', REF_NAME: '', ...env },
  });
  return { status: r.status, out: r.stdout + r.stderr };
};

test('pull request: an edited migration fails, a new one passes; the base is origin/<base ref>', () => {
  withRepo((dir) => {
    git(dir, ['checkout', '-q', '-b', 'feature']);
    commit(dir, { 'db/migrations/0002_second.sql': 'SELECT 2;\n' });
    const ok = run(dir, { EVENT_NAME: 'pull_request', BASE_REF: 'main' });
    assert.equal(ok.status, 0, ok.out);
    assert.match(ok.out, /compared with origin\/main/);

    commit(dir, { [MIGRATION]: 'SELECT 99;\n' });
    const bad = run(dir, { EVENT_NAME: 'pull_request', BASE_REF: 'main' });
    assert.equal(bad.status, 1, bad.out);
    assert.match(bad.out, /db\/migrations\/0001_first\.sql.*committed migration modified/);
  });
});

test('pull request: a missing base ref is an error, never a silent pass', () => {
  withRepo((dir) => {
    const r = run(dir, { EVENT_NAME: 'pull_request', BASE_REF: '' });
    assert.equal(r.status, 2, r.out);
    assert.match(r.out, /BASE_REF/);
    const gone = run(dir, { EVENT_NAME: 'pull_request', BASE_REF: 'nope' });
    assert.equal(gone.status, 2, gone.out);
    assert.match(gone.out, /origin\/nope/);
  });
});

test('push to main: the migration edited since the previous tip fails (the hole in I2)', () => {
  withRepo((dir) => {
    const before = head(dir);
    commit(dir, { [MIGRATION]: 'SELECT 99;\n' });
    const r = run(dir, { EVENT_NAME: 'push', BEFORE_SHA: before, REF_NAME: 'main' });
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /compared with [0-9a-f]{40} \(the branch tip before this push\)/);
    assert.match(r.out, /committed migration modified/);
  });
});

test('push to main: a new migration passes', () => {
  withRepo((dir) => {
    const before = head(dir);
    commit(dir, { 'db/migrations/0002_second.sql': 'SELECT 2;\n' });
    const r = run(dir, { EVENT_NAME: 'push', BEFORE_SHA: before, REF_NAME: 'main' });
    assert.equal(r.status, 0, r.out);
  });
});

test('push of a new branch (all-zeros before): compared with origin/main, and it says so', () => {
  withRepo((dir) => {
    git(dir, ['checkout', '-q', '-b', 'feature']);
    commit(dir, { [MIGRATION]: 'SELECT 99;\n' });
    const r = run(dir, { EVENT_NAME: 'push', BEFORE_SHA: ZEROS, REF_NAME: 'feature' });
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /new branch/);
    assert.match(r.out, /compared with origin\/main/);
    assert.match(r.out, /committed migration modified/);
  });
});

test('force push (the old tip is not in this history): compared with origin/main, and it says so', () => {
  withRepo((dir) => {
    git(dir, ['checkout', '-q', '-b', 'feature']);
    commit(dir, { [MIGRATION]: 'SELECT 99;\n' });
    const r = run(dir, { EVENT_NAME: 'push', BEFORE_SHA: 'a'.repeat(40), REF_NAME: 'feature' });
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /force push/);
    assert.match(r.out, /compared with origin\/main/);
  });
});

test('first push of main (nothing earlier to compare with): says so loudly, still checks the names', () => {
  withRepo((dir) => {
    const r = run(dir, { EVENT_NAME: 'push', BEFORE_SHA: ZEROS, REF_NAME: 'main' });
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /::warning::/);
    assert.match(r.out, /nothing to compare/);
    commit(dir, { 'db/migrations/Bad_Name.sql': 'SELECT 1;\n' });
    git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const names = run(dir, { EVENT_NAME: 'push', BEFORE_SHA: ZEROS, REF_NAME: 'main' });
    assert.equal(names.status, 1, 'the file-name rules still run');
    assert.match(names.out, /must match NNNN_name\.sql/);
  });
});

test('an event that is neither push nor pull_request is an error', () => {
  withRepo((dir) => {
    const r = run(dir, { EVENT_NAME: 'schedule' });
    assert.equal(r.status, 2, r.out);
    assert.match(r.out, /schedule/);
  });
});
