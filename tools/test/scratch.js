// Test helpers: a scratch git repository carrying the real hooks and linters and FIXED COPIES of the
// version, changelog and ARB files (tools/test/fixtures), so the hooks are exercised exactly as they
// run and no test depends on the live files. (The live files move with every stamped commit; tests
// that read them failed once hooks were on.) Never touches the real repository. Plain CommonJS.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { clearLocalGitEnv } = require('./clean-git-env');

// A scratch repository is only scratch if its git commands do not inherit GIT_DIR and friends (see
// clean-git-env.js). Cleared here as well as in timeout.js, so a file that uses this helper alone is safe.
clearLocalGitEnv();

const REAL = path.resolve(__dirname, '..', '..');

/** Folders and files copied from the real repo into every scratch repo. */
const COPIED = [
  '.githooks',
  'tools/hooks',
  'tools/lint',
  'tools/fingerprint.js',
  'tools/ci-guards.js',
  'tools/ci-migrations.js',
  '.claude/hooks',
  '.gitignore',
  'app/.gitignore',
];

/** Fixed fixture -> where it sits in a scratch repo. */
const FIXTURES = path.join(__dirname, 'fixtures');
const FIXTURE_FILES = {
  'app_version.dart': 'app/lib/core/config/app_version.dart',
  'changelog.dart': 'app/lib/core/config/changelog.dart',
  'app_en.arb': 'app/lib/l10n/app_en.arb',
};

/**
 * A test folder or node_modules inside the repository: not copied into a scratch repo. It looks at
 * the path RELATIVE to the repository, so a repository that itself lives under a "test" folder works.
 */
function isTestPath(relative) {
  return relative.split(/[\\/]/).some((part) => part === 'test' || part === 'node_modules');
}

function copy(rel, to) {
  const from = path.join(REAL, rel);
  const target = path.join(to, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(from, target, {
    recursive: true,
    filter: (src) => !isTestPath(path.relative(REAL, src)),
  });
}

/** Runs git in `cwd`. env may override GABAY_NOW and friends. */
function git(cwd, args, { env = {}, input } = {}) {
  const merged = { ...process.env };
  // On Windows the variable is "Path": an override must replace it, not sit beside it.
  if (Object.keys(env).some((k) => k.toLowerCase() === 'path')) {
    for (const k of Object.keys(merged)) if (k.toLowerCase() === 'path') delete merged[k];
  }
  const r = spawnSync('git', ['-c', 'user.email=t@example.test', '-c', 'user.name=Test', ...args], {
    cwd,
    encoding: 'utf8',
    input,
    env: { ...merged, ...env },
  });
  return {
    status: r.status,
    out: `${r.stdout}`,
    err: `${r.stderr}`,
    all: `${r.stdout}${r.stderr}`,
  };
}

/**
 * A repo with one commit of the app's version and changelog files (and the hooks), hooksPath set.
 * Extra files can be given as { 'path': 'content' } and are in the first commit.
 */
function scratchRepo(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gabay-hooks-'));
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'core.autocrlf', 'false']);
  git(dir, ['config', 'core.hooksPath', '.githooks']);
  for (const rel of COPIED) copy(rel, dir);
  for (const [name, rel] of Object.entries(FIXTURE_FILES)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.copyFileSync(path.join(FIXTURES, name), path.join(dir, rel));
  }
  fs.writeFileSync(path.join(dir, '.gitattributes'), '* text=auto eol=lf\n');
  for (const [rel, content] of Object.entries(extra)) write(dir, rel, content);
  // The hooks must run as committed: mark them executable in the index.
  git(dir, ['add', '-A']);
  for (const hook of ['pre-commit', 'post-commit', 'pre-push']) {
    git(dir, ['update-index', '--chmod=+x', `.githooks/${hook}`]);
  }
  // First commit without hooks: it only sets the baseline.
  const first = git(dir, ['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'baseline']);
  if (first.status !== 0) throw new Error(`baseline commit failed: ${first.all}`);
  return dir;
}

function write(dir, rel, content) {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const headFile = (dir, rel) => git(dir, ['show', `HEAD:${rel}`]).out;
const remove = (dir) => fs.rmSync(dir, { recursive: true, force: true });

module.exports = { isTestPath, FIXTURES, REAL, scratchRepo, git, write, read, headFile, remove };
