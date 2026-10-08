// .github/workflows: the rules of L133, L135, L136 and plan S7, checked on the text (no YAML package is installed in
// CI's lint job; the rules are in workflow-rules.js). Actions cannot run here, so these tests pin what can be
// pinned: every action is GitHub's own and pinned to a full SHA, nothing uses a secret or writes to GitHub, every
// job has a timeout, no failure is swallowed, nothing is uploaded that is not on an allow-list, the build job
// cannot be reached from a fork, and the `verify --only` lists name real checks. Then each rule is proved able to
// FAIL: a table of deliberately broken copies, each of which must be reported (S7 review I3).
// S7 round 4: the whole non-comment text of each workflow is also pinned by a snapshot (workflow-snapshot.js), the
// backstop for every edit no rule names.
'use strict';

const test = require('./timeout');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CHECKS } = require('../verify');
const {
  checkWorkflow,
  flutterPinFromBlueprint,
  plainProblems,
  BUILD_IF,
} = require('./workflow-rules');

const ROOT = path.resolve(__dirname, '..', '..');
const DIR = path.join(ROOT, '.github', 'workflows');
const FILES = ['lint.yml', 'e2e.yml', 'build.yml'];
const text = (name) => fs.readFileSync(path.join(DIR, name), 'utf8');
const BLUEPRINT = fs.readFileSync(
  path.join(ROOT, 'docs', 'product', 'GABAY_MASTER_BLUEPRINT.md'),
  'utf8',
);

const DATABASE_CHECKS = [
  'schema-run-1',
  'schema-run-2',
  'seed',
  'functions-health',
  'api-tests',
  'db-tools-tests',
];

// Built from code points: a literal LS or PS in this file would be a line break to ESLint and to editors.
const LS_CHAR = String.fromCodePoint(0x2028);
const PS_CHAR = String.fromCodePoint(0x2029);
const BOM_CHAR = String.fromCodePoint(0xfeff);
const SNAPSHOT_DIR = path.join(__dirname, 'workflow-snapshots');
const snapshots = Object.fromEntries(
  FILES.filter((n) => fs.existsSync(path.join(SNAPSHOT_DIR, `${n}.snap`))).map((n) => [
    n,
    fs.readFileSync(path.join(SNAPSHOT_DIR, `${n}.snap`), 'utf8'),
  ]),
);

const CTX = {
  snapshots,
  checks: CHECKS.map((c) => c.name),
  databaseChecks: DATABASE_CHECKS,
  flutterPin: flutterPinFromBlueprint(BLUEPRINT),
  setupMinutes: 10,
  shutdownMinutes: 1,
  marginMinutes: 5,
  lintRestMinutes: 15,
};

test('the three workflows exist and nothing else is in the folder', () => {
  assert.deepEqual(fs.readdirSync(DIR).sort(), [...FILES].sort());
});

test('the Flutter pin is read from Blueprint Part 1, so a Blueprint bump fails this test until the workflows follow', () => {
  assert.match(CTX.flutterPin, /^\d+\.\d+$/, 'Blueprint Part 1 has a "Flutter / Dart" pin row');
});

for (const name of FILES) {
  test(`${name}: keeps every rule (permissions, timeouts, pinned actions, no secrets, no swallowed failure, upload allow-list, cost header)`, () => {
    assert.deepEqual(checkWorkflow(name, text(name), CTX), []);
  });
}

test('lint.yml and build.yml install the same Flutter', () => {
  const version = (name) => /--branch (\d+\.\d+\.\d+) /.exec(text(name))[1];
  assert.equal(version('lint.yml'), version('build.yml'));
});

test('lint.yml: the verify --only list is every check that needs no database, and in verify the order is cheap first', () => {
  const only = /--only\s+([a-z0-9,-]+)/.exec(text('lint.yml').replace(/\n\s+/g, ' '))[1].split(',');
  assert.deepEqual(
    CTX.checks.filter((c) => !DATABASE_CHECKS.includes(c)),
    CTX.checks.filter((c) => only.includes(c)),
  );
});

test('e2e.yml: the database half, and the schema runs come before the tests that read it (verify ignores the order of --only)', () => {
  const only = /--only ([a-z0-9,-]+)/.exec(text('e2e.yml'))[1].split(',');
  const inRunOrder = CTX.checks.filter((c) => only.includes(c));
  assert.deepEqual(only, inRunOrder, 'the list is written in the order verify will run it');
  assert.ok(inRunOrder.indexOf('schema-run-2') < inRunOrder.indexOf('api-tests'));
});

test('build.yml: the job runs only after lint succeeded on a push of this repository (C1), or by hand', () => {
  const m = /^ {4}if: (.+)$/m.exec(text('build.yml'));
  assert.equal(m[1], BUILD_IF);
  for (const needle of [
    "github.event.workflow_run.conclusion == 'success'",
    "github.event.workflow_run.event == 'push'",
    'github.event.workflow_run.head_repository.full_name == github.repository',
  ]) {
    assert.ok(m[1].includes(needle), needle);
  }
  assert.doesNotMatch(m[1], /always\(\)/);
});

// ---- every rule must be able to fail ---------------------------------------------------------------------

/** What every snapshot failure says: the file and line, the snapshot it differs from, and how to update it. */
const SNAPSHOT_MISMATCH =
  /^(lint|e2e|build)\.yml:\d+: the workflow text differs from tools\/test\/workflow-snapshots\/\1\.yml\.snap/;

/** Replaces `from` by `to` in the named file's text; the edit must really change it. */
const edit = (file, from, to) => ({ file, apply: (t) => t.replace(from, to) });

const MUTATIONS = [
  // C1: the build job reachable from a fork
  [
    'build: the fork-PR guard (event == push) removed',
    'build.yml',
    edit('build.yml', " && github.event.workflow_run.event == 'push'", ''),
    /build\.yml: the job's if:/,
  ],
  [
    'build: the head-repository guard removed',
    'build.yml',
    edit(
      'build.yml',
      ' && github.event.workflow_run.head_repository.full_name == github.repository',
      '',
    ),
    /build\.yml: the job's if:/,
  ],
  [
    'build: && turned into || in the if',
    'build.yml',
    edit('build.yml', "'success' && github.event", "'success' || github.event"),
    /build\.yml: the job's if:/,
  ],
  [
    'build: always() added to the if',
    'build.yml',
    edit('build.yml', 'github.repository)\n', 'github.repository) || always()\n'),
    /build\.yml/,
  ],
  [
    'build: the branches: [main] filter removed',
    'build.yml',
    edit('build.yml', '    branches: [main]\n', ''),
    /build\.yml: triggers/,
  ],
  // I3
  [
    'e2e: continue-on-error on the verify step',
    'e2e.yml',
    edit(
      'e2e.yml',
      '      - name: verify, the database half\n',
      '      - name: verify, the database half\n        continue-on-error: true\n',
    ),
    /continue-on-error/,
  ],
  [
    'lint: "|| true" after the guards',
    'lint.yml',
    edit('lint.yml', 'run: npm run ci:guards', 'run: npm run ci:guards || true'),
    /swallow/,
  ],
  [
    'lint: "|| :" after the guards',
    'lint.yml',
    edit('lint.yml', 'run: npm run ci:guards', 'run: npm run ci:guards || :'),
    /swallow/,
  ],
  [
    'e2e: "|| true" after docker logs',
    'e2e.yml',
    edit(
      'e2e.yml',
      'docker logs "$id" > postgres.log 2>&1',
      'docker logs "$id" > postgres.log 2>&1 || true',
    ),
    /swallow/,
  ],
  [
    'lint: a ${{ }} expression inside run:',
    'lint.yml',
    edit(
      'lint.yml',
      'run: node tools/ci-migrations.js',
      'run: node tools/ci-migrations.js ${{ github.head_ref }}',
    ),
    /expression inside run:/,
  ],
  [
    'build: a ${{ }} expression inside run: (the commit stamp)',
    'build.yml',
    edit(
      'build.yml',
      'run: node tools/ci-build-info.js >> "$GITHUB_OUTPUT"',
      'run: echo ${{ github.event.workflow_run.head_branch }} && node tools/ci-build-info.js >> "$GITHUB_OUTPUT"',
    ),
    /expression inside run:/,
  ],
  [
    'e2e: the tee step loses shell: bash (a pipe without pipefail)',
    'e2e.yml',
    edit(
      'e2e.yml',
      '      - name: verify, the database half\n        shell: bash\n',
      '      - name: verify, the database half\n',
    ),
    /pipe needs "shell: bash"/,
  ],
  [
    'e2e: the log step loses shell: bash',
    'e2e.yml',
    edit(
      'e2e.yml',
      '        if: failure() || cancelled()\n        shell: bash\n        run: |\n          id=',
      '        if: failure() || cancelled()\n        run: |\n          id=',
    ),
    /pipe needs "shell: bash"/,
  ],
  [
    'e2e: the upload path becomes "."',
    'e2e.yml',
    edit('e2e.yml', '            verify.log\n', '            .\n'),
    /uploads "\."/,
  ],
  [
    'e2e: the .env is added to the upload',
    'e2e.yml',
    edit('e2e.yml', '            verify.log\n', '            verify.log\n            .env\n'),
    /uploads "\.env"/,
  ],
  [
    'e2e: a whole folder is uploaded',
    'e2e.yml',
    edit('e2e.yml', '            postgres.log\n', '            db/seeds\n'),
    /uploads "db\/seeds"/,
  ],
  [
    'build: the web build path widened to app',
    'build.yml',
    edit('build.yml', 'path: app/build/web', 'path: app'),
    /uploads "app"/,
  ],
  [
    'lint: an upload added',
    'lint.yml',
    edit(
      'lint.yml',
      '      - name: verify, the checks that need no database',
      '      - uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2\n        with:\n          path: .\n      - name: verify, the checks that need no database',
    ),
    /lint\.yml/,
  ],
  // I4
  [
    'e2e: the upload runs on failure only (a timeout is a cancel)',
    'e2e.yml',
    edit(
      'e2e.yml',
      '        if: failure() || cancelled()\n        uses: actions/upload-artifact',
      '        if: failure()\n        uses: actions/upload-artifact',
    ),
    /if: failure\(\) \|\| cancelled\(\)/,
  ],
  [
    'e2e: the service log is collected on failure only',
    'e2e.yml',
    edit(
      'e2e.yml',
      '        if: failure() || cancelled()\n        shell: bash',
      '        if: failure()\n        shell: bash',
    ),
    /if: failure\(\) \|\| cancelled\(\)/,
  ],
  [
    'e2e: the job timeout shortened below the checks',
    'e2e.yml',
    edit('e2e.yml', 'timeout-minutes: 50', 'timeout-minutes: 45'),
    /timeout-minutes 45 is shorter/,
  ],
  [
    'e2e: the per-check cap removed',
    'e2e.yml',
    edit('e2e.yml', "      GABAY_VERIFY_CHECK_TIMEOUT_MS: '300000'\n", ''),
    /GABAY_VERIFY_CHECK_TIMEOUT_MS/,
  ],
  // I2
  [
    'lint: the event left out of the concurrency group',
    'lint.yml',
    edit('lint.yml', 'lint-${{ github.event_name }}-', 'lint-'),
    /concurrency group/,
  ],
  [
    'lint: the migration step limited to pull requests',
    'lint.yml',
    edit(
      'lint.yml',
      '      - name: Committed migrations are never edited (push and pull request)\n',
      "      - name: Committed migrations are never edited (push and pull request)\n        if: github.event_name == 'pull_request'\n",
    ),
    /no if:/,
  ],
  [
    'lint: the migration step removed',
    'lint.yml',
    edit('lint.yml', 'run: node tools/ci-migrations.js', 'run: echo skipped'),
    /migration-history step/,
  ],
  [
    'lint: the push base (BEFORE_SHA) not passed',
    'lint.yml',
    edit('lint.yml', '          BEFORE_SHA: ${{ github.event.before }}\n', ''),
    /BEFORE_SHA/,
  ],
  [
    'lint: cancel-in-progress turned off',
    'lint.yml',
    edit('lint.yml', 'cancel-in-progress: true', 'cancel-in-progress: false'),
    /cancel-in-progress/,
  ],
  // L136
  [
    'e2e: the pull_request trigger removed',
    'e2e.yml',
    edit('e2e.yml', '  pull_request:\n    branches: [main]\n', ''),
    /triggers: pull_request to main/,
  ],
  [
    'e2e: a pull_request_target trigger',
    'e2e.yml',
    edit(
      'e2e.yml',
      '  pull_request:\n    branches: [main]\n',
      '  pull_request_target:\n    branches: [main]\n',
    ),
    /pull_request_target|triggers/,
  ],
  [
    'e2e: superseded pull-request runs no longer cancel',
    'e2e.yml',
    edit(
      'e2e.yml',
      "cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
      'cancel-in-progress: false',
    ),
    /superseded pull-request runs cancel/,
  ],
  [
    'e2e: the nightly schedule removed',
    'e2e.yml',
    edit('e2e.yml', "  schedule:\n    - cron: '0 18 * * *'\n", ''),
    /triggers/,
  ],
  [
    'e2e: a repository secret used',
    'e2e.yml',
    edit(
      'e2e.yml',
      'DB_PASSWORD: gabay-ci-${{ github.run_id }}-${{ github.run_attempt }}',
      'DB_PASSWORD: ${{ secrets.DB_PASSWORD }}',
    ),
    /repository secret/,
  ],
  [
    'e2e: the schema runs after the tests in the --only list',
    'e2e.yml',
    edit(
      'e2e.yml',
      '--only schema-run-1,schema-run-2,api-tests,db-tools-tests,seed,functions-health',
      '--only api-tests,schema-run-1,schema-run-2,db-tools-tests,seed,functions-health',
    ),
    /e2e\.yml/,
  ],
  [
    'e2e: a database check dropped from --only',
    'e2e.yml',
    edit('e2e.yml', ',db-tools-tests', ''),
    /exactly the database half/,
  ],
  // the common rules
  [
    'lint: an action pinned by tag',
    'lint.yml',
    edit(
      'lint.yml',
      'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
      'actions/checkout@v7',
    ),
    /pinned to a full SHA/,
  ],
  [
    'lint: a third-party action',
    'lint.yml',
    edit(
      'lint.yml',
      'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
      'someone/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
    ),
    /pinned to a full SHA/,
  ],
  [
    'lint: write permission added',
    'lint.yml',
    edit('lint.yml', 'permissions:\n  contents: read', 'permissions:\n  contents: write'),
    /top-level permissions/,
  ],
  [
    'lint: the job timeout removed',
    'lint.yml',
    edit('lint.yml', '    timeout-minutes: 30\n', ''),
    /timeout-minutes/,
  ],
  [
    'lint: a deploy step',
    'lint.yml',
    edit('lint.yml', 'run: npm run ci:guards', 'run: npm run ci:guards && firebase deploy'),
    /deploys/,
  ],
  [
    'lint: the cost header removed',
    'lint.yml',
    edit('lint.yml', '# COST (L135', '# BUDGET (L135'),
    /COST/,
  ],
  [
    'lint: a Flutter other than the Blueprint pin',
    'lint.yml',
    edit('lint.yml', '--branch 3.47.5 ', '--branch 3.46.0 '),
    /not the Blueprint pin/,
  ],
  [
    'lint: a cache key that no longer carries the version',
    'lint.yml',
    edit('lint.yml', 'key: flutter-3.47.5-', 'key: flutter-'),
    /cache key/,
  ],
  [
    'lint: an unconditional guard weakened to a pull-request trigger only',
    'lint.yml',
    edit('lint.yml', 'on:\n  push:\n    branches: [main]\n  pull_request:', 'on:\n  pull_request:'),
    /pull request and on pushes to main only/,
  ],
  [
    'lint: the push trigger on every branch again (I-B)',
    'lint.yml',
    edit('lint.yml', '  push:\n    branches: [main]\n', '  push:\n'),
    /pull request and on pushes to main only/,
  ],
  [
    'lint: REF_TYPE not passed to the migration step',
    'lint.yml',
    edit('lint.yml', '          REF_TYPE: ${{ github.ref_type }}\n', ''),
    /REF_TYPE/,
  ],
  // ---- S7 round 2, I-C: the probes that switched the gate off without tripping the old rules ----
  [
    'P1 lint: if: false on the verify step',
    'lint.yml',
    edit(
      'lint.yml',
      '      - name: verify, the checks that need no database\n',
      '      - name: verify, the checks that need no database\n        if: false\n',
    ),
    /gate step "verify": no if:/,
  ],
  [
    'P2 lint: if: false on the guards step',
    'lint.yml',
    edit(
      'lint.yml',
      '      - name: Secret guard and changelog duplicate guard (the checked-out tree)\n',
      '      - name: Secret guard and changelog duplicate guard (the checked-out tree)\n        if: false\n',
    ),
    /gate step "guards": no if:/,
  ],
  [
    'P3 lint: if: false on the job (a skipped job reports success)',
    'lint.yml',
    edit(
      'lint.yml',
      '  lint:\n    runs-on: ubuntu-latest\n',
      '  lint:\n    if: false\n    runs-on: ubuntu-latest\n',
    ),
    /the lint job has no if:/,
  ],
  [
    "P4 e2e: if: github.event_name != 'pull_request' on the job",
    'e2e.yml',
    edit(
      'e2e.yml',
      '  e2e:\n    runs-on: ubuntu-latest\n',
      "  e2e:\n    if: github.event_name != 'pull_request'\n    runs-on: ubuntu-latest\n",
    ),
    /the e2e job has no if:/,
  ],
  [
    'P6 e2e: verify.js --list --only (prints, runs nothing, exits 0)',
    'e2e.yml',
    edit(
      'e2e.yml',
      'node tools/verify.js --only schema',
      'node tools/verify.js --list --only schema',
    ),
    /gate step "verify": its run: must be exactly/,
  ],
  [
    'P7 e2e: set +o pipefail before verify',
    'e2e.yml',
    edit(
      'e2e.yml',
      '        run: |\n          node tools/verify.js --only',
      '        run: |\n          set +o pipefail\n          node tools/verify.js --only',
    ),
    /gate step "verify": its run: must be exactly/,
  ],
  [
    'P8 e2e: "; exit 0" after the tee',
    'e2e.yml',
    edit('e2e.yml', 'tee verify.log\n', 'tee verify.log; exit 0\n'),
    /gate step "verify": its run: must be exactly/,
  ],
  [
    'P10 lint: fetch-depth 0 -> 1 (a normal push would look like a force push)',
    'lint.yml',
    edit('lint.yml', 'fetch-depth: 0 # the migration', 'fetch-depth: 1 # the migration'),
    /fetch-depth: 0/,
  ],
  [
    'P12 lint: echo in front of the verify command',
    'lint.yml',
    edit(
      'lint.yml',
      'run: >-\n          node tools/verify.js --only',
      'run: >-\n          echo node tools/verify.js --only',
    ),
    /gate step "verify": its run: must be exactly/,
  ],
  [
    'P13 e2e: echo in front of the verify command',
    'e2e.yml',
    edit(
      'e2e.yml',
      'node tools/verify.js --only schema',
      'echo node tools/verify.js --only schema',
    ),
    /gate step "verify": its run: must be exactly/,
  ],
  [
    'lint: a check dropped from the verify list',
    'lint.yml',
    edit('lint.yml', ',flutter-test', ''),
    /gate step "verify": its run: must be exactly/,
  ],
  [
    'lint: a working-directory on the guards step',
    'lint.yml',
    edit(
      'lint.yml',
      '        run: npm run ci:guards',
      '        working-directory: app\n        run: npm run ci:guards',
    ),
    /unexpected key "working-directory"/,
  ],
  [
    'lint: an env on the verify step',
    'lint.yml',
    edit(
      'lint.yml',
      '      - name: verify, the checks that need no database\n',
      '      - name: verify, the checks that need no database\n        env:\n          CI: false\n',
    ),
    /unexpected key "env"/,
  ],
  [
    'lint: the per-check cap removed',
    'lint.yml',
    edit('lint.yml', "    env:\n      GABAY_VERIFY_CHECK_TIMEOUT_MS: '600000'\n", ''),
    /GABAY_VERIFY_CHECK_TIMEOUT_MS/,
  ],
  [
    'lint: the job timeout shortened below the cap plus the rest',
    'lint.yml',
    edit('lint.yml', 'timeout-minutes: 30', 'timeout-minutes: 20'),
    /timeout-minutes 20 is shorter/,
  ],
  [
    'e2e: the verify step loses its shell',
    'e2e.yml',
    edit(
      'e2e.yml',
      '      - name: verify, the database half\n        shell: bash\n',
      '      - name: verify, the database half\n',
    ),
    /shell: bash/,
  ],
  [
    'e2e: the header calls the repository private again',
    'e2e.yml',
    edit(
      'e2e.yml',
      '# COST (L135: the repository is public)',
      '# COST (private repository, 2,000 minutes)',
    ),
    /private repository/,
  ],
  // ---- S7 round 3: two holes the round-3 review got through (env values unpinned; a step added before a gate) ----
  [
    'R3-a1 lint: BEFORE_SHA from github.sha (a push to main would compare the commit with itself)',
    'lint.yml',
    edit('lint.yml', 'BEFORE_SHA: ${{ github.event.before }}', 'BEFORE_SHA: ${{ github.sha }}'),
    /migration-history step's env must be exactly/,
  ],
  [
    'R3-a2 lint: EVENT_NAME from another context value',
    'lint.yml',
    edit('lint.yml', 'EVENT_NAME: ${{ github.event_name }}', 'EVENT_NAME: ${{ github.ref_type }}'),
    /migration-history step's env must be exactly/,
  ],
  [
    'R3-a3 lint: an extra variable in the migration step env (NODE_OPTIONS)',
    'lint.yml',
    edit(
      'lint.yml',
      '          REF_TYPE: ${{ github.ref_type }}\n',
      '          REF_TYPE: ${{ github.ref_type }}\n          NODE_OPTIONS: --require ./x.js\n',
    ),
    /migration-history step's env must be exactly/,
  ],
  [
    "R3-b1 lint: a step before verify rewrites it (sed -i '1i process.exit(0);' tools/v*.js)",
    'lint.yml',
    edit(
      'lint.yml',
      '      - name: verify, the checks that need no database\n',
      "      - name: Tidy\n        run: sed -i '1i process.exit(0);' tools/v*.js\n\n      - name: verify, the checks that need no database\n",
    ),
    /step list/,
  ],
  [
    'R3-b2 lint: a step before verify puts a fake node first on $GITHUB_PATH',
    'lint.yml',
    edit(
      'lint.yml',
      '      - name: verify, the checks that need no database\n',
      '      - name: Tools\n        run: mkdir -p "$HOME/fake" && printf \'#!/bin/sh\\nexit 0\\n\' > "$HOME/fake/node" && chmod +x "$HOME/fake/node" && echo "$HOME/fake" >> "$GITHUB_PATH"\n\n      - name: verify, the checks that need no database\n',
    ),
    /step list/,
  ],
  [
    'R3-b3 lint: an existing step (Put Flutter on the PATH) also prepends a fake node folder',
    'lint.yml',
    edit(
      'lint.yml',
      'run: echo "$HOME/flutter/bin" >> "$GITHUB_PATH"',
      'run: echo "$HOME/flutter/bin" >> "$GITHUB_PATH" && echo "$HOME/fake" >> "$GITHUB_PATH"',
    ),
    /step "Put Flutter on the PATH": .*run/,
  ],
  [
    'R3-b4 lint: a step removed (the database tools install)',
    'lint.yml',
    edit(
      'lint.yml',
      "      - name: Install the database tools' packages\n        run: npm ci --prefix db/tools\n\n",
      '',
    ),
    /step list/,
  ],
  [
    'R3-b5 lint: two steps swapped (the two installs)',
    'lint.yml',
    edit(
      'lint.yml',
      "      - name: Install the API's packages (ESLint and Prettier come from here)\n        run: npm ci --prefix functions\n\n      - name: Install the database tools' packages\n        run: npm ci --prefix db/tools\n",
      "      - name: Install the database tools' packages\n        run: npm ci --prefix db/tools\n\n      - name: Install the API's packages (ESLint and Prettier come from here)\n        run: npm ci --prefix functions\n",
    ),
    /step list/,
  ],
  [
    'R3-b6 lint: an env added to an install step (NODE_OPTIONS)',
    'lint.yml',
    edit(
      'lint.yml',
      '        run: npm ci --prefix db/tools\n',
      '        env:\n          NODE_OPTIONS: --require ./x.js\n        run: npm ci --prefix db/tools\n',
    ),
    /step "Install the database tools' packages": .*keys/,
  ],
  [
    "R3-b7 e2e: a step before verify rewrites it (sed -i '1i process.exit(0);' tools/v*.js)",
    'e2e.yml',
    edit(
      'e2e.yml',
      '      - name: verify, the database half\n',
      "      - name: Tidy\n        run: sed -i '1i process.exit(0);' tools/v*.js\n\n      - name: verify, the database half\n",
    ),
    /step list/,
  ],
  [
    'R3-b8 e2e: a step before verify puts a fake node first on $GITHUB_PATH',
    'e2e.yml',
    edit(
      'e2e.yml',
      '      - name: verify, the database half\n',
      '      - name: Tools\n        run: mkdir -p "$HOME/fake" && printf \'#!/bin/sh\\nexit 0\\n\' > "$HOME/fake/node" && chmod +x "$HOME/fake/node" && echo "$HOME/fake" >> "$GITHUB_PATH"\n\n      - name: verify, the database half\n',
    ),
    /step list/,
  ],
  [
    'R3-b9 e2e: the .env step changed (it runs before verify)',
    'e2e.yml',
    edit(
      'e2e.yml',
      '          set -eu\n',
      '          set -eu\n          echo "$HOME/fake" >> "$GITHUB_PATH"\n',
    ),
    /step "Write \.env from throwaway values.*": .*run/,
  ],
  [
    'R3-b10 e2e: two steps swapped (the installs)',
    'e2e.yml',
    edit(
      'e2e.yml',
      "      - name: Install the API's packages\n        run: npm ci --prefix functions\n\n      - name: Install the database tools' packages\n        run: npm ci --prefix db/tools\n",
      "      - name: Install the database tools' packages\n        run: npm ci --prefix db/tools\n\n      - name: Install the API's packages\n        run: npm ci --prefix functions\n",
    ),
    /step list/,
  ],
  [
    'R3-b11 e2e: a step removed (the seed packages install)',
    'e2e.yml',
    edit(
      'e2e.yml',
      "      - name: Install the seed's packages (firebase-tools lives here)\n        run: npm ci --prefix db/seeds\n\n",
      '',
    ),
    /step list/,
  ],
  // ---- S7 round 4: the whole non-comment text is pinned. Edits no rule above names ----
  [
    'R4-1 lint: NODE_OPTIONS --import data:...process.exit(0) in the job env (every node exits 0)',
    'lint.yml',
    edit(
      'lint.yml',
      "      GABAY_VERIFY_CHECK_TIMEOUT_MS: '600000'\n",
      "      GABAY_VERIFY_CHECK_TIMEOUT_MS: '600000'\n      NODE_OPTIONS: --import data:text/javascript,process.exit(0)\n",
    ),
    SNAPSHOT_MISMATCH,
  ],
  [
    'R4-2 lint: NODE_OPTIONS at workflow level',
    'lint.yml',
    edit(
      'lint.yml',
      'permissions:\n  contents: read\n',
      'permissions:\n  contents: read\n\nenv:\n  NODE_OPTIONS: --import data:text/javascript,process.exit(0)\n',
    ),
    SNAPSHOT_MISMATCH,
  ],
  [
    'R4-3 e2e: NODE_OPTIONS in the job env',
    'e2e.yml',
    edit(
      'e2e.yml',
      "      GABAY_VERIFY_CHECK_TIMEOUT_MS: '300000'\n",
      "      GABAY_VERIFY_CHECK_TIMEOUT_MS: '300000'\n      NODE_OPTIONS: --import data:text/javascript,process.exit(0)\n",
    ),
    SNAPSHOT_MISMATCH,
  ],
  [
    'R4-4 lint: defaults: run: shell: true {0} at workflow level (every run: becomes a no-op)',
    'lint.yml',
    edit(
      'lint.yml',
      'permissions:\n  contents: read\n',
      'permissions:\n  contents: read\n\ndefaults:\n  run:\n    shell: true {0}\n',
    ),
    SNAPSHOT_MISMATCH,
  ],
  [
    'R4-5 e2e: defaults: run: shell: true {0} as the job default',
    'e2e.yml',
    edit(
      'e2e.yml',
      '    timeout-minutes: 50\n',
      '    timeout-minutes: 50\n    defaults:\n      run:\n        shell: true {0}\n',
    ),
    SNAPSHOT_MISMATCH,
  ],
  [
    'R4-6 e2e: defaults: run: shell: true {0} at workflow level',
    'e2e.yml',
    edit(
      'e2e.yml',
      'permissions:\n  contents: read\n',
      'permissions:\n  contents: read\n\ndefaults:\n  run:\n    shell: true {0}\n',
    ),
    SNAPSHOT_MISMATCH,
  ],
  [
    "R4-7 lint: the checkout gains ref: main (verify would test another commit's files)",
    'lint.yml',
    edit(
      'lint.yml',
      '          fetch-depth: 0 # the migration',
      '          ref: main\n          fetch-depth: 0 # the migration',
    ),
    SNAPSHOT_MISMATCH,
  ],
  [
    'R4-8 lint: the checkout gains sparse-checkout: tools/',
    'lint.yml',
    edit(
      'lint.yml',
      '          fetch-depth: 0 # the migration',
      '          sparse-checkout: tools/\n          fetch-depth: 0 # the migration',
    ),
    SNAPSHOT_MISMATCH,
  ],
  [
    'R4-9 build: NODE_OPTIONS in the job env (the workflow_run job is pinned too)',
    'build.yml',
    edit(
      'build.yml',
      '    timeout-minutes: 40\n',
      '    timeout-minutes: 40\n    env:\n      NODE_OPTIONS: --import data:text/javascript,process.exit(0)\n',
    ),
    SNAPSHOT_MISMATCH,
  ],
  // ---- S7 round 5, 1: a line break the rules do not see is still a line break to the runner ----
  ...[
    ['R5-1', 'a bare CR', '\r', /^lint\.yml:\d+: character U\+000D \(CR\)/],
    ['R5-2', 'a NEL (U+0085)', '\u0085', /^lint\.yml:\d+: character U\+0085/],
    ['R5-3', 'an LS (U+2028)', LS_CHAR, /^lint\.yml:\d+: character U\+2028/],
    ['R5-4', 'a PS (U+2029)', PS_CHAR, /^lint\.yml:\d+: character U\+2029/],
  ].map(([id, what, ch, expected]) => [
    `${id} lint: ${what} inside a comment line hides a NODE_OPTIONS line from the rules, not from the runner`,
    'lint.yml',
    edit(
      'lint.yml',
      "      GABAY_VERIFY_CHECK_TIMEOUT_MS: '600000'\n",
      `      GABAY_VERIFY_CHECK_TIMEOUT_MS: '600000'\n      # a note about the cap${ch}      NODE_OPTIONS: --import data:text/javascript,process.exit(0)\n`,
    ),
    expected,
  ]),
  [
    'R5-5 lint: the whole file with CRLF line ends',
    'lint.yml',
    { apply: (t) => t.replace(/\n/g, '\r\n') },
    /^lint\.yml:\d+: character U\+000D \(CR\)/,
  ],
  [
    'R5-6 e2e: a NEL inside a comment line',
    'e2e.yml',
    edit('e2e.yml', '# COST (L135', '# COST\u0085(L135'),
    /^e2e\.yml:\d+: character U\+0085/,
  ],
  [
    'R5-7 build: a PS inside a comment line',
    'build.yml',
    edit('build.yml', '\npermissions:', '\n# note' + PS_CHAR + 'permissions:\npermissions:'),
    /^build\.yml:\d+: character U\+2029/,
  ],
  // ---- S7 round 5, 3: the action SHA is part of the snapshot ----
  [
    'R5-8 lint: the checkout SHA swapped for another 40-hex value (an action upgrade must change the snapshot)',
    'lint.yml',
    edit(
      'lint.yml',
      'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
      `actions/checkout@${'a'.repeat(40)} # v7.0.1`,
    ),
    SNAPSHOT_MISMATCH,
  ],
  [
    'R5-9 lint: the version comment of an action changed (same SHA)',
    'lint.yml',
    edit(
      'lint.yml',
      'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
      'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.2',
    ),
    SNAPSHOT_MISMATCH,
  ],
  // ---- S7 round 5, 4a: inside a block scalar a blank line and a "#" line are content ----
  [
    'R5-10 lint: a blank line inside the folded verify command (it changes the folded text)',
    'lint.yml',
    edit('lint.yml', 'node tools/verify.js --only\n', 'node tools/verify.js --only\n\n'),
    SNAPSHOT_MISMATCH,
  ],
  [
    'R5-11 e2e: a blank line inside the literal .env script',
    'e2e.yml',
    edit('e2e.yml', '          set -eu\n', '          set -eu\n\n'),
    SNAPSHOT_MISMATCH,
  ],
  [
    'R5-12 lint: a "#" line inside the folded verify command is command text, not a comment',
    'lint.yml',
    edit(
      'lint.yml',
      'node tools/verify.js --only\n',
      'node tools/verify.js --only\n          # node-version\n',
    ),
    SNAPSHOT_MISMATCH,
  ],
  [
    'R5-13 lint: a blank line between two lines of a literal list (cache-dependency-path)',
    'lint.yml',
    edit('lint.yml', 'functions/package-lock.json\n', 'functions/package-lock.json\n\n'),
    SNAPSHOT_MISMATCH,
  ],
];

for (const [label, file, mutation, expected] of MUTATIONS) {
  test(`a broken copy is reported: ${label}`, () => {
    const original = text(file);
    const mutated = mutation.apply(original);
    assert.notEqual(mutated, original, 'the edit must really change the file');
    const problems = checkWorkflow(file, mutated, CTX);
    assert.ok(problems.length > 0, 'the rules let this edit through');
    assert.ok(
      problems.some((p) => expected.test(p)),
      `expected ${expected}, got:\n${problems.join('\n')}`,
    );
  });
}

test('the mutation table covers each rule kind named in the S7 review (I3) at least once', () => {
  const kinds = [
    /continue-on-error/,
    /\|\| true/,
    /\|\| :/,
    /expression inside run/,
    /shell: bash/,
    /upload/,
    /build:.*if|always/,
  ];
  const labels = MUTATIONS.map((m) => m[0]).join('\n');
  for (const k of kinds) assert.match(labels, k);
});

// ---- S7 round 4: the snapshot of the whole non-comment text (tools/test/workflow-snapshots) ----------------

test('every workflow has a snapshot, and no snapshot is left over from a deleted workflow', () => {
  assert.deepEqual(fs.readdirSync(SNAPSHOT_DIR).sort(), FILES.map((n) => `${n}.snap`).sort());
});

test('a workflow without a snapshot fails closed', () => {
  const problems = checkWorkflow('lint.yml', text('lint.yml'), { ...CTX, snapshots: {} });
  assert.ok(
    problems.some((p) => /lint\.yml: no snapshot/.test(p)),
    problems.join('\n'),
  );
});

test('the failure names the file and the first differing line, shows both texts and says how to update the snapshot', () => {
  const mutated = text('lint.yml').replace(
    '          fetch-depth: 0 # the migration',
    '          ref: main\n          fetch-depth: 0 # the migration',
  );
  const line = mutated.split('\n').findIndex((l) => l.trim() === 'ref: main') + 1;
  const [problem] = checkWorkflow('lint.yml', mutated, CTX).filter((p) =>
    SNAPSHOT_MISMATCH.test(p),
  );
  assert.ok(problem.startsWith(`lint.yml:${line}: `), problem);
  assert.match(problem, /ref: main/, 'the line found');
  assert.match(problem, /fetch-depth: 0/, 'the line the snapshot has');
  assert.match(problem, /edit tools\/test\/workflow-snapshots\/lint\.yml\.snap in the same commit/);
});

for (const name of FILES) {
  test(`${name}: a Flutter version bump and a comment edit are not snapshot failures`, () => {
    let mutated = text(name).replace(/^# .*$/m, '# an edited comment line');
    const flutter = /--branch (\d+\.\d+\.\d+) /.exec(mutated);
    if (flutter) mutated = mutated.split(flutter[1]).join('3.47.9');
    assert.notEqual(mutated, text(name));
    assert.deepEqual(checkWorkflow(name, mutated, CTX), []);
  });

  // S7 round 5 (owner ruling): an action upgrade must change the snapshot too. Another well-formed 40-hex SHA with
  // the same version comment passes every other rule, so only the snapshot can catch it.
  test(`${name}: swapping the first action's SHA for another 40-hex value fails the snapshot of the real file`, () => {
    const sha = /(uses: actions\/[a-z-]+@)([0-9a-f]{40})( # v\d+\.\d+\.\d+)/.exec(text(name));
    const other = sha[2] === 'a'.repeat(40) ? 'b'.repeat(40) : 'a'.repeat(40);
    const mutated = text(name).replace(sha[0], `${sha[1]}${other}${sha[3]}`);
    const problems = checkWorkflow(name, mutated, CTX);
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.match(problems[0], SNAPSHOT_MISMATCH, 'no other rule notices: the SHA is well formed');
    assert.ok(problems[0].includes(other), 'the line found is shown');
    assert.ok(problems[0].includes(sha[2]), 'the line the snapshot has is shown');
  });
}

test('blank lines between steps and after a block scalar are not snapshot failures (only blank lines inside a block count)', () => {
  const lint = text('lint.yml').replace(
    '      - name: Cache Flutter\n',
    '\n\n      - name: Cache Flutter\n',
  );
  const e2e = text('e2e.yml').replace('tee verify.log\n', 'tee verify.log\n\n\n');
  assert.notEqual(lint, text('lint.yml'));
  assert.notEqual(e2e, text('e2e.yml'));
  assert.deepEqual(checkWorkflow('lint.yml', lint, CTX), []);
  assert.deepEqual(checkWorkflow('e2e.yml', e2e, CTX), []);
});

// ---- S7 round 5: plain characters only -----------------------------------------------------------------------

test('the workflow files and their snapshots hold printable ASCII, tab and LF only', () => {
  for (const name of FILES) {
    assert.deepEqual(plainProblems(name, text(name)), [], name);
    assert.deepEqual(plainProblems(`${name}.snap`, snapshots[name] ?? ''), [], `${name}.snap`);
  }
});

test('a tab in a comment is allowed, and the other rules are untouched by it', () => {
  const mutated = text('lint.yml').replace('# COST', '#\tCOST');
  assert.notEqual(mutated, text('lint.yml'));
  assert.deepEqual(checkWorkflow('lint.yml', mutated, CTX), []);
});

test('plainProblems names the file, the line and the character code, and says why', () => {
  const [p] = plainProblems('lint.yml', 'a: 1\nb: 2 # x\ry: 3\n');
  assert.match(p, /^lint\.yml:2: character U\+000D \(CR\)/);
  assert.match(p, /printable ASCII, tab and LF only/);
  assert.ok(plainProblems('x', '\u0085'.repeat(20)).length <= 6, 'a flood is cut short');
});

for (const [label, ch, code] of [
  ['CR', '\r', 'U+000D'],
  ['NEL', '\u0085', 'U+0085'],
  ['LS', LS_CHAR, 'U+2028'],
  ['PS', PS_CHAR, 'U+2029'],
  ['VT', '\u000b', 'U+000B'],
  ['DEL', '\u007f', 'U+007F'],
  ['a letter with an accent', 'é', 'U+00E9'],
]) {
  test(`a snapshot file with ${label} is reported (the .snap files are plain too)`, () => {
    const mutated = snapshots['lint.yml'].replace('jobs:', `jobs:${ch}`);
    const problems = plainProblems('lint.yml.snap', mutated);
    assert.ok(
      problems.some((p) => p.includes(code)),
      problems.join('\n'),
    );
  });
}

test('a BOM at the start of a workflow is reported', () => {
  const problems = checkWorkflow('lint.yml', `${BOM_CHAR}${text('lint.yml')}`, CTX);
  assert.ok(
    problems.some((p) => /^lint\.yml:1: character U\+FEFF/.test(p)),
    problems.join('\n'),
  );
});
