// .github/workflows: the rules of L133 and plan S7, checked on the text (no YAML package is installed in
// CI's lint job). Actions cannot run here, so these tests pin what can be pinned: every action is GitHub's own
// and pinned to a full SHA, nothing uses a secret or writes to GitHub, every job has a timeout, and the
// `verify --only` lists name real checks and keep the database checks out of lint.yml.
'use strict';

const test = require('./timeout');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CHECKS } = require('../verify');

const DIR = path.resolve(__dirname, '..', '..', '.github', 'workflows');
const FILES = ['lint.yml', 'e2e.yml', 'build.yml'];
const text = (name) => fs.readFileSync(path.join(DIR, name), 'utf8');
/** The lines that are not comments. */
const code = (name) =>
  text(name)
    .split('\n')
    .filter((l) => !/^\s*#/.test(l));

const DATABASE_CHECKS = [
  'schema-run-1',
  'schema-run-2',
  'seed',
  'functions-health',
  'api-tests',
  'db-tools-tests',
];

test('the three workflows exist and nothing else is in the folder', () => {
  assert.deepEqual(fs.readdirSync(DIR).sort(), [...FILES].sort());
});

for (const name of FILES) {
  test(`${name}: top-level permissions are read-only, and every job has a timeout`, () => {
    const src = code(name).join('\n');
    assert.match(
      src,
      /^permissions:\n {2}contents: read$/m,
      'permissions: contents: read at the top',
    );
    assert.doesNotMatch(src, /^[ \t]+permissions:/m, 'no job widens it');
    const jobs = src.slice(src.indexOf('\njobs:'));
    const jobNames = [...jobs.matchAll(/^ {2}([a-z0-9_-]+):\n/gm)].map((m) => m[1]);
    assert.ok(jobNames.length >= 1);
    assert.equal(
      [...jobs.matchAll(/^ {4}timeout-minutes: \d+$/gm)].length,
      jobNames.length,
      'a timeout per job',
    );
  });

  test(`${name}: only GitHub's own actions, each pinned to a full commit SHA with its version in a comment`, () => {
    const uses = code(name).filter((l) => /^\s*(- )?uses:/.test(l));
    assert.ok(uses.length > 0);
    for (const line of uses) {
      assert.match(line, /uses: actions\/[a-z-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/, line.trim());
    }
  });

  test(`${name}: no repository secrets, no writes to GitHub, no deploy, no store upload`, () => {
    const src = code(name).join('\n');
    assert.doesNotMatch(src, /secrets\./);
    assert.doesNotMatch(src, /\bgh (pr|issue|release|api|repo)\b/);
    assert.doesNotMatch(
      src,
      /git push|firebase deploy|docker push|fastlane|flutter publish|upload-to-store/i,
    );
    assert.doesNotMatch(src, /GITHUB_TOKEN/);
  });

  test(`${name}: states its cost in minutes in the header comment`, () => {
    const header = text(name).split('\n').slice(0, 30).join('\n');
    assert.match(header, /COST/);
    assert.match(header, /minutes/);
  });
}

test('lint.yml: every push and pull request; one run per branch; the guards and the database-free verify checks', () => {
  const src = code('lint.yml').join('\n');
  assert.match(src, /^on:\n {2}push:\n {2}pull_request:$/m);
  assert.match(
    src,
    /concurrency:\n {2}group: lint-\$\{\{ github\.head_ref \|\| github\.ref_name \}\}\n {2}cancel-in-progress: true/,
  );
  assert.match(src, /run: npm run ci:guards/);
  assert.match(src, /node-version-file: \.nvmrc/);
  assert.match(
    src,
    /git clone --depth 1 --branch 3\.47\.5 https:\/\/github\.com\/flutter\/flutter\.git/,
  );
  const only = /--only\s+([a-z0-9,-]+)/.exec(src.replace(/\n\s+/g, ' '))[1].split(',');
  const known = CHECKS.map((c) => c.name);
  for (const c of only) assert.ok(known.includes(c), `${c} is a verify check`);
  for (const c of only)
    assert.ok(!DATABASE_CHECKS.includes(c), `${c} needs the database: it belongs in e2e.yml`);
  assert.deepEqual(
    known.filter((c) => !only.includes(c) && !DATABASE_CHECKS.includes(c)),
    [],
    'every other check runs here',
  );
});

test('e2e.yml: nightly at 02:00 Manila (18:00 UTC) and on demand; PostgreSQL 18; throwaway .env; logs kept 7 days', () => {
  const src = code('e2e.yml').join('\n');
  assert.match(src, /schedule:\n\s+- cron: '0 18 \* \* \*'/);
  assert.match(src, /workflow_dispatch:/);
  assert.match(src, /image: postgres:18$/m);
  assert.match(src, /openssl rand -hex 16/);
  assert.match(src, /::add-mask::/);
  const only = /--only ([a-z0-9,-]+)/.exec(src)[1].split(',');
  assert.deepEqual([...only].sort(), [...DATABASE_CHECKS].sort(), 'exactly the database half');
  for (const c of only) assert.ok(CHECKS.some((x) => x.name === c));
  assert.match(src, /if: failure\(\)\n\s+uses: actions\/upload-artifact@/);
  assert.match(src, /retention-days: 7/);
  assert.doesNotMatch(src, /^\s+(\.env|\*\*\/\.env)\s*$/m, 'the .env is never uploaded');
});

test('build.yml: after lint succeeds on main (or by hand); both builds stamped; artifacts kept 3 days', () => {
  const src = code('build.yml').join('\n');
  assert.match(
    src,
    /workflow_run:\n\s+workflows: \[lint\]\n\s+types: \[completed\]\n\s+branches: \[main\]/,
  );
  assert.match(src, /workflow_dispatch:/);
  assert.match(src, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(src, /flutter build web -t lib\/main_admin\.dart --release/);
  assert.match(src, /flutter build apk --debug -t lib\/main_mobile\.dart/);
  assert.equal([...src.matchAll(/--dart-define=API_BASE=https:\/\/api\.invalid\/api/g)].length, 2);
  for (const define of ['APP_VERSION', 'BUILD_NUMBER', 'GIT_COMMIT', 'BUILD_TIME']) {
    assert.equal([...src.matchAll(new RegExp(`--dart-define=${define}=`, 'g'))].length, 2, define);
  }
  assert.equal([...src.matchAll(/--build-name=/g)].length, 2);
  assert.equal([...src.matchAll(/--build-number=/g)].length, 2);
  assert.match(src, /fetch-depth: 0/);
  assert.equal([...src.matchAll(/retention-days: 3/g)].length, 2);
  assert.match(
    src,
    /actions\/setup-java@[0-9a-f]{40} # v\d+\.\d+\.\d+\n\s+with:\n\s+distribution: temurin\n\s+java-version: '17'/,
  );
});

test('flutter: the version in every workflow is the Blueprint pin, and the cache key says so', () => {
  for (const name of ['lint.yml', 'build.yml']) {
    const src = code(name).join('\n');
    assert.match(src, /--branch 3\.47\.5 /);
    assert.match(src, /key: flutter-3\.47\.5-\$\{\{ runner\.os \}\}/);
  }
});
