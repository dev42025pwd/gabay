// Regression test for INC-001 (the pre-push incident of 2026-10-09): a push from a LINKED git worktree runs
// .githooks/pre-push -> `npm run verify` with git's hook environment (GIT_DIR is exported as an absolute
// path into .git/worktrees/<name>). verify's own tests build scratch repositories; their git commands
// inherited GIT_DIR and hit the REAL repository instead: core.bare=true in its config, test commits on a
// real branch, branches `feature` and `wt/test`, a switched worktree.
//
// Two layers are proven here, on scratch repositories only (never the real one):
//   1. the hook gives verify a clean git environment (git's own documented idiom, `git help githooks`:
//      "unset $(git rev-parse --local-env-vars)"), in a linked worktree and in a main checkout;
//   2. defence in depth: even a hand run of the tests with GIT_DIR set cannot reach an outer repository.
'use strict';

const test = require('./timeout');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { scratchRepo, git, remove, REAL } = require('./scratch');
const { LOCAL_GIT_ENV_VARS, withoutLocalGitEnv } = require('./clean-git-env');

/** A bare "remote" in a temp folder. */
function bareRemote() {
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'gabay-remote-'));
  git(remote, ['init', '-q', '--bare', '-b', 'main']);
  return remote;
}

/**
 * A scratch repo whose verify.js is a stub that reports, on stdout, which of git's per-repository
 * variables it was given and which repository git resolves for it.
 */
function repoWithReportingVerify() {
  const names = JSON.stringify(
    spawnSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' })
      .stdout.split('\n')
      .filter(Boolean),
  );
  return scratchRepo({
    'tools/verify.js': `
const { spawnSync } = require('node:child_process');
const leaked = ${names}.filter((name) => name in process.env);
const gitDir = spawnSync('git', ['rev-parse', '--absolute-git-dir'], { encoding: 'utf8' }).stdout.trim();
process.stdout.write('LEAKED=[' + leaked.join(',') + ']\\n');
process.stdout.write('GITDIR=' + gitDir + '\\n');
process.stdout.write('CWD=' + process.cwd() + '\\n');
`,
  });
}

const norm = (p) => path.resolve(p).split(path.sep).join('/').toLowerCase();
const line = (text, key) => new RegExp(`^${key}=(.*)$`, 'm').exec(text)?.[1].trim();

test('pre-push from a linked worktree: verify gets no per-repository git variables and sees the worktree', () => {
  const dir = repoWithReportingVerify();
  const remote = bareRemote();
  const wt = `${dir}-wt`;
  try {
    git(dir, ['remote', 'add', 'origin', remote.split(path.sep).join('/')]);
    const added = git(dir, ['worktree', 'add', '-q', '-b', 'topic', wt]);
    assert.equal(added.status, 0, added.all);
    const gitDirOfWt = git(wt, ['rev-parse', '--absolute-git-dir']).out.trim();
    assert.match(norm(gitDirOfWt), /\/\.git\/worktrees\//, 'this is a linked worktree');

    const r = git(wt, ['push', 'origin', 'topic']);
    assert.equal(r.status, 0, r.all);
    assert.equal(line(r.all, 'LEAKED'), '[]', `verify inherited git variables:\n${r.all}`);
    assert.equal(
      norm(line(r.all, 'GITDIR')),
      norm(gitDirOfWt),
      'verify resolves the worktree repo',
    );
    assert.equal(norm(line(r.all, 'CWD')), norm(wt), 'verify runs in the worktree root');
  } finally {
    remove(dir);
    remove(wt);
    remove(remote);
  }
});

test('pre-push from a main checkout: verify gets no per-repository git variables either', () => {
  const dir = repoWithReportingVerify();
  const remote = bareRemote();
  try {
    git(dir, ['remote', 'add', 'origin', remote.split(path.sep).join('/')]);
    const r = git(dir, ['push', 'origin', 'main']);
    assert.equal(r.status, 0, r.all);
    assert.equal(line(r.all, 'LEAKED'), '[]', `verify inherited git variables:\n${r.all}`);
    assert.equal(norm(line(r.all, 'GITDIR')), norm(path.join(dir, '.git')));
    assert.equal(norm(line(r.all, 'CWD')), norm(dir));
  } finally {
    remove(dir);
    remove(remote);
  }
});

// ---- layer 2: the tests themselves ---------------------------------------------------------------

/** Everything about a repository that the incident changed, as one comparable text. */
function snapshot(dir) {
  return ['config --list --local', 'branch -a', 'worktree list', 'log --oneline --all']
    .map((args) => `$ git ${args}\n${git(dir, args.split(' ')).all}`)
    .join('\n');
}

/** The test process minus node:test's own context (a child `node --test` would refuse to run). */
function handEnv(extra) {
  const env = { ...process.env, ...extra };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

test("clean-git-env: removes git's per-repository variables and nothing else", () => {
  const env = withoutLocalGitEnv({
    GIT_DIR: 'x',
    GIT_WORK_TREE: 'x',
    GIT_INDEX_FILE: 'x',
    GIT_COMMON_DIR: 'x',
    GIT_PREFIX: 'x',
    GIT_OBJECT_DIRECTORY: 'x',
    GIT_ALTERNATE_OBJECT_DIRECTORIES: 'x',
    GIT_EDITOR: 'keep',
    GIT_AUTHOR_NAME: 'keep',
    PATH: 'keep',
  });
  assert.deepEqual(env, {
    GIT_EDITOR: 'keep',
    GIT_AUTHOR_NAME: 'keep',
    PATH: 'keep',
  });
});

test('clean-git-env: its list covers every variable this git reports as repository-local', () => {
  const reported = spawnSync('git', ['rev-parse', '--local-env-vars'], {
    encoding: 'utf8',
  })
    .stdout.split('\n')
    .filter(Boolean);
  const missing = reported.filter((name) => !LOCAL_GIT_ENV_VARS.includes(name));
  assert.deepEqual(missing, [], 'add these to LOCAL_GIT_ENV_VARS in tools/test/clean-git-env.js');
});

/** Test files that build scratch repositories in three different ways. */
const HAND_RUN_FILES = [
  'tools/lint/test/migrations-immutable.test.js', // its own git helper (the file the incident failed first)
  'tools/test/ci-build-info.test.js', // tools/test/scratch.js
  'tools/test/fingerprint.test.js', // plain timeout wrapper only
];

test('a hand run of the tests with GIT_DIR set cannot reach the repository GIT_DIR names', () => {
  const outer = scratchRepo();
  const outerWt = `${outer}-wt`;
  try {
    assert.equal(git(outer, ['worktree', 'add', '-q', '-b', 'outer-topic', outerWt]).status, 0);
    const gitDir = git(outerWt, ['rev-parse', '--absolute-git-dir']).out.trim();
    assert.ok(
      norm(gitDir).startsWith(norm(os.tmpdir())),
      'GIT_DIR names a scratch repo, not the real one',
    );
    const before = snapshot(outer);
    const beforeWt = snapshot(outerWt);

    const r = spawnSync(process.execPath, ['--test', ...HAND_RUN_FILES], {
      cwd: REAL,
      encoding: 'utf8',
      env: handEnv({ GIT_DIR: gitDir }),
    });
    assert.equal(r.status, 0, `${r.stdout.slice(-3000)}\n${r.stderr.slice(-1000)}`);
    assert.equal(snapshot(outer), before, 'the outer repository is unchanged');
    assert.equal(snapshot(outerWt), beforeWt, 'the outer worktree is unchanged');
    assert.equal(
      fs.readFileSync(path.join(outer, '.git', 'config'), 'utf8').includes('bare = true'),
      false,
      'core.bare was not set',
    );
  } finally {
    remove(outer);
    remove(outerWt);
  }
});

// ---- the helper is only as good as its use: every tools test must load the wrapper -----------------

// Every `tools/**/*.test.js` (tools/test and tools/lint/test) must load tools/test/timeout.js, which clears
// git's per-repository variables (INC-001). Loading scratch.js or verify-scratch.js does not count: they do
// not load the wrapper. Out of scope: functions/test and db/tools/test. They start no git, and the
// reviewer classified every file there, so a scratch repository cannot be built from them.
const TOOLS = path.join(REAL, 'tools');
const WRAPPER = path.join(TOOLS, 'test', 'timeout.js');

/** The tools test files (absolute paths), node_modules skipped. */
function toolsTestFiles(dir = TOOLS) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : toolsTestFiles(full);
    return entry.name.endsWith('.test.js') ? [full] : [];
  });
}

/** True when the source of `file` requires tools/test/timeout.js by any relative path. */
function loadsWrapper(file, source) {
  const requires = [...source.matchAll(/require\(\s*(['"])(\.{1,2}\/[^'"]*)\1\s*\)/g)];
  return requires.some((m) => {
    const target = path.resolve(path.dirname(file), m[2]);
    return target === WRAPPER || `${target}.js` === WRAPPER;
  });
}

/** The files among `files` ({ file: source }) that do not load the wrapper. */
const withoutWrapper = (files) =>
  Object.entries(files)
    .filter(([file, source]) => !loadsWrapper(file, source))
    .map(([file]) => path.relative(REAL, file).split(path.sep).join('/'));

test('the wrapper check names a test file that does not load timeout.js', () => {
  const t = (rel) => path.join(TOOLS, rel);
  const found = withoutWrapper({
    [t('test/ok-a.test.js')]: "const test = require('./timeout');",
    [t('lint/test/ok-b.test.js')]: 'const test = require("../../test/timeout");',
    [t('test/ok-c.test.js')]: "const test = require('./timeout.js');",
    [t('test/bad-plain.test.js')]: "const test = require('node:test');",
    [t('test/bad-scratch.test.js')]: "const { git } = require('./scratch');",
    [t('lint/test/bad-wrong.test.js')]: "const test = require('./timeout');", // lint/test has no timeout.js
  });
  assert.deepEqual(found, [
    'tools/test/bad-plain.test.js',
    'tools/test/bad-scratch.test.js',
    'tools/lint/test/bad-wrong.test.js',
  ]);
});

test('every tools/**/*.test.js loads the timeout wrapper (so GIT_* is cleared)', () => {
  const files = toolsTestFiles();
  assert.ok(files.length > 20, 'the walk found the tools test files');
  const sources = Object.fromEntries(files.map((f) => [f, fs.readFileSync(f, 'utf8')]));
  assert.deepEqual(
    withoutWrapper(sources),
    [],
    "these test files do not require('./timeout') (tools/test/timeout.js): add it",
  );
});
