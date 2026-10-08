// The rules every .github/workflows file must keep (L133, L135, L136; plan S7), as a function over the file's text:
// checkWorkflow(name, text, context) returns the list of problems (empty = the file keeps the rules).
// Actions cannot run here and CI's lint job has no YAML package, so the rules read the text line by line.
// tools/test/workflows.test.js runs them over the real files, and over each of a table of deliberately broken
// copies to prove every rule can fail (S7 review I3: the first version let 8 of 11 gate-breaking edits through).
'use strict';

/** Exactly what each workflow may upload; anything else (a "." or an .env among them) is a problem. */
const ALLOWED_UPLOADS = {
  'lint.yml': [],
  'e2e.yml': [
    'verify.log',
    'postgres.log',
    'firebase-debug.log',
    'ui-debug.log',
    'db/seeds/firebase-debug.log',
  ],
  'build.yml': ['app/build/web', 'app/build/app/outputs/flutter-apk/app-debug.apk'],
};

/** The build job's `if:`, exactly (S7 review C1: a fork's pull request must never reach this job). */
const BUILD_IF =
  "github.event_name == 'workflow_dispatch' || (github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'push' && github.event.workflow_run.head_repository.full_name == github.repository)";

const LINT_CONCURRENCY_GROUP =
  'lint-${{ github.event_name }}-${{ github.event.pull_request.number || github.sha }}';
const E2E_CONCURRENCY_GROUP =
  'e2e-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}';

/** What is left of a text without its whole-line comments. */
const codeLines = (text) => text.split('\n').filter((l) => !/^\s*#/.test(l));

/** The leading comment block (everything before the first line that is not a comment or blank). */
function header(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (line.trim() !== '' && !/^\s*#/.test(line)) break;
    out.push(line);
  }
  return out.join('\n');
}

/** The steps of every job: each is its lines (a step starts at `      - ` under `    steps:`). */
function steps(text) {
  const out = [];
  let current = null;
  for (const line of codeLines(text)) {
    if (/^ {6}- /.test(line)) {
      current = [];
      out.push(current);
    } else if (line.trim() !== '' && !/^ {7,}/.test(line)) {
      current = null; // a line at a shallower indent ends the step list
    }
    if (current) current.push(line);
  }
  return out;
}

/** The lines under `key:` (a block scalar or a list of lines more indented than the key), or the inline value. */
function valueLines(lines, index) {
  const m = /^(\s*)(?:- )?[a-z-]+:\s*(.*)$/.exec(lines[index]);
  const keyIndent = m[1].length + (/^\s*- /.test(lines[index]) ? 2 : 0);
  const inline = m[2].trim();
  if (inline !== '' && !/^[|>][+-]?$/.test(inline)) return [inline];
  const out = [];
  for (let i = index + 1; i < lines.length; i += 1) {
    const indent = /^( *)/.exec(lines[i])[1].length;
    if (lines[i].trim() !== '' && indent <= keyIndent) break;
    out.push(lines[i].trim());
  }
  return out.filter(Boolean);
}

/** What a step runs: the text of its `run:` (inline or block), or null when it has none. */
function runText(stepLines) {
  const at = stepLines.findIndex((l) => /^\s*(- )?run:/.test(l));
  return at === -1 ? null : valueLines(stepLines, at).join('\n');
}

const stepAttr = (stepLines, key) => {
  const at = stepLines.findIndex((l) => new RegExp(`^\\s*(- )?${key}:`).test(l));
  return at === -1 ? null : valueLines(stepLines, at).join(' ');
};

/** The `path:` entries of an upload-artifact step. */
function uploadPaths(stepLines) {
  const at = stepLines.findIndex((l) => /^\s+path:/.test(l));
  return at === -1 ? [] : valueLines(stepLines, at);
}

const PIPE = /(^|[^|])\|(?!\|)/m;
const SWALLOW = /\|\|\s*(true\b|:|exit\s+0\b|echo\b)/;

/** Rules for every workflow. */
function commonProblems(name, text, ctx) {
  const problems = [];
  const add = (message) => problems.push(`${name}: ${message}`);
  const src = codeLines(text).join('\n');

  if (!/^permissions:\n {2}contents: read$/m.test(src))
    add('top-level permissions must be "contents: read" alone');
  if (/^[ \t]+permissions:/m.test(src)) add('a job widens its permissions');
  const jobs = src.slice(src.indexOf('\njobs:'));
  const jobNames = [...jobs.matchAll(/^ {2}([a-z0-9_-]+):\n/gm)].map((m) => m[1]);
  if (jobNames.length < 1) add('no job found');
  if ([...jobs.matchAll(/^ {4}timeout-minutes: \d+$/gm)].length !== jobNames.length) {
    add('every job needs a timeout-minutes');
  }

  const uses = codeLines(text).filter((l) => /^\s*(- )?uses:/.test(l));
  if (uses.length === 0) add('no actions used (checkout is expected)');
  for (const line of uses) {
    if (!/uses: actions\/[a-z-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/.test(line)) {
      add(
        `only GitHub's own actions, pinned to a full SHA with the version in a comment: ${line.trim()}`,
      );
    }
  }

  if (/secrets\./.test(src)) add('uses a repository secret');
  if (/GITHUB_TOKEN/.test(src)) add('uses GITHUB_TOKEN');
  if (/\bgh (pr|issue|release|api|repo)\b/.test(src)) add('calls the GitHub CLI');
  if (/git push|firebase deploy|docker push|fastlane|flutter publish|upload-to-store/i.test(src)) {
    add('pushes, deploys or uploads to a store');
  }
  if (/pull_request_target|issue_comment|repository_dispatch/.test(src)) {
    add("a trigger that runs with the base repository's trust on outside input");
  }
  if (name !== 'build.yml' && /^\s+workflow_run:/m.test(src))
    add('only build.yml may use workflow_run');
  if (/continue-on-error/.test(src))
    add('continue-on-error hides a failure: a step either passes or fails the run');

  const head = header(text);
  if (!/COST/.test(head) || !/minutes/.test(head))
    add('the header comment must state the COST in minutes');
  if (/GitHub Free private|2,000 (Actions )?minutes|no branch protection/i.test(head)) {
    add(
      'the header still budgets minutes for a private repository (L135: the repository is public, minutes are free)',
    );
  }

  for (const step of steps(text)) {
    const run = runText(step);
    const label = (stepAttr(step, 'name') ?? step[0]).trim();
    if (run !== null) {
      if (run.includes('${{'))
        add(`step "${label}": a \${{ }} expression inside run: (pass the value through env:)`);
      if (SWALLOW.test(run)) add(`step "${label}": "|| true" and its kin swallow a failure`);
      if (PIPE.test(run) && stepAttr(step, 'shell') !== 'bash') {
        add(
          `step "${label}": a pipe needs "shell: bash" (pipefail), or a failing first command is hidden`,
        );
      }
    }
    if (step.some((l) => /uses: actions\/upload-artifact@/.test(l))) {
      const allowed = ALLOWED_UPLOADS[name] ?? [];
      const paths = uploadPaths(step);
      if (paths.length === 0) add(`step "${label}": an upload with no path`);
      for (const p of paths) {
        if (!allowed.includes(p))
          add(`step "${label}": uploads "${p}", which is not on ${name}'s allow-list`);
      }
    }
  }
  if (name === 'lint.yml' && /upload-artifact/.test(src)) add('lint.yml uploads nothing');

  // Flutter: the version cloned, the cache key and the step name agree, and it is the Blueprint's major.minor.
  const clone = /--branch (\d+\.\d+\.\d+) https:\/\/github\.com\/flutter\/flutter\.git/.exec(src);
  if (name !== 'e2e.yml') {
    if (!clone) add('no Flutter install found');
    else {
      const v = clone[1];
      if (ctx.flutterPin && !v.startsWith(`${ctx.flutterPin}.`)) {
        add(`Flutter ${v} is not the Blueprint pin (Flutter ${ctx.flutterPin})`);
      }
      if (
        !new RegExp(
          `key: flutter(-android)?-${v.replace(/\./g, '\\.')}-\\$\\{\\{ runner\\.os \\}\\}`,
        ).test(src)
      ) {
        add(`the Flutter cache key does not carry ${v}`);
      }
      if (!src.includes(`Install Flutter ${v} (the Blueprint pin)`))
        add(`the install step does not name ${v}`);
    }
  }
  return problems;
}

/** Rules for lint.yml. */
function lintProblems(text, ctx) {
  const problems = [];
  const add = (message) => problems.push(`lint.yml: ${message}`);
  const src = codeLines(text).join('\n');
  if (!/^on:\n {2}push:\n {2}pull_request:$/m.test(src))
    add('runs on every push and pull request, nothing else');
  const group = /^concurrency:\n {2}group: (.+)\n {2}cancel-in-progress: (.+)$/m.exec(src);
  if (!group || group[1] !== LINT_CONCURRENCY_GROUP) {
    add(
      `concurrency group must be "${LINT_CONCURRENCY_GROUP}" (push and pull-request runs must not cancel each other)`,
    );
  }
  if (!group || group[2] !== 'true') add('cancel-in-progress: true');
  if (!/run: npm run ci:guards$/m.test(src))
    add('the secret and changelog guards (npm run ci:guards) must run');
  if (!/node-version-file: \.nvmrc/.test(src)) add('Node comes from .nvmrc');

  const migration = steps(text).find((s) => runText(s) === 'node tools/ci-migrations.js');
  if (!migration) add('the migration-history step (node tools/ci-migrations.js) must run');
  else {
    if (stepAttr(migration, 'if') !== null)
      add('the migration-history step must run on push AND pull_request: no if:');
    for (const key of ['EVENT_NAME', 'BASE_REF', 'BEFORE_SHA', 'REF_NAME']) {
      if (!migration.some((l) => new RegExp(`^\\s+${key}: \\$\\{\\{ [a-z_.]+ \\}\\}$`).test(l))) {
        add(`the migration-history step needs ${key} from the event, through env`);
      }
    }
  }

  const only = /--only\s+([a-z0-9,-]+)/.exec(src.replace(/\n\s+/g, ' '));
  if (!only) add('no verify --only list');
  else {
    const list = only[1].split(',');
    for (const c of list) {
      if (!ctx.checks.includes(c)) add(`${c} is not a verify check`);
      if (ctx.databaseChecks.includes(c)) add(`${c} needs the database: it belongs in e2e.yml`);
    }
    const missing = ctx.checks.filter((c) => !list.includes(c) && !ctx.databaseChecks.includes(c));
    if (missing.length) add(`these checks run nowhere: ${missing.join(', ')}`);
  }
  return problems;
}

/** Rules for e2e.yml. */
function e2eProblems(text, ctx) {
  const problems = [];
  const add = (message) => problems.push(`e2e.yml: ${message}`);
  const src = codeLines(text).join('\n');
  if (
    !/^on:\n {2}pull_request:\n {4}branches: \[main\]\n {2}schedule:\n {4}- cron: '0 18 \* \* \*'\n {2}workflow_dispatch:$/m.test(
      src,
    )
  ) {
    add(
      "triggers: pull_request to main (L136), nightly '0 18 * * *' (02:00 Manila), workflow_dispatch, nothing else",
    );
  }
  const group = /^concurrency:\n {2}group: (.+)\n {2}cancel-in-progress: (.+)$/m.exec(src);
  if (!group || group[1] !== E2E_CONCURRENCY_GROUP)
    add(`concurrency group must be "${E2E_CONCURRENCY_GROUP}"`);
  if (!group || group[2] !== "${{ github.event_name == 'pull_request' }}") {
    add('superseded pull-request runs cancel; nightly and manual runs do not');
  }
  if (!/image: postgres:18$/m.test(src)) add('PostgreSQL 18 service');
  if (!/openssl rand -hex 16/.test(src) || !/::add-mask::/.test(src))
    add('throwaway, masked seed passwords');

  const only = /--only ([a-z0-9,-]+)/.exec(src);
  if (!only) add('no verify --only list');
  else {
    const list = only[1].split(',');
    if ([...list].sort().join() !== [...ctx.databaseChecks].sort().join())
      add('exactly the database half');
    for (const c of list) if (!ctx.checks.includes(c)) add(`${c} is not a verify check`);
    const inRunOrder = ctx.checks.filter((c) => list.includes(c));
    if (list.join() !== inRunOrder.join())
      add(
        "the --only list must be written in verify's run order (the schema before the tests that read it)",
      );
  }

  // Logs are collected and uploaded when the run fails or is cancelled (a timeout is a cancel).
  for (const step of steps(text)) {
    const label = (stepAttr(step, 'name') ?? '').trim();
    const isLog =
      /upload-artifact/.test(step.join('\n')) || /^Collect the PostgreSQL service log/.test(label);
    if (isLog && stepAttr(step, 'if') !== 'failure() || cancelled()') {
      add(`step "${label}": if: failure() || cancelled()`);
    }
  }
  if (!/retention-days: 7$/m.test(src)) add('logs are kept 7 days');

  // The job's timeout must outlast every check's own (capped) timeout, or a hang ends as a cancelled run.
  const knob = /^ {6}GABAY_VERIFY_CHECK_TIMEOUT_MS: '(\d+)'$/m.exec(src);
  const timeout = /^ {4}timeout-minutes: (\d+)$/m.exec(src);
  if (!knob) add('GABAY_VERIFY_CHECK_TIMEOUT_MS must cap every check (I4)');
  else if (timeout && only) {
    const perCheckMinutes = Number(knob[1]) / 60_000;
    const worst = only[1].split(',').length * perCheckMinutes + ctx.setupMinutes;
    if (Number(timeout[1]) < worst) {
      add(
        `timeout-minutes ${timeout[1]} is shorter than ${only[1].split(',').length} checks x ${perCheckMinutes} min + ${ctx.setupMinutes} min of setup`,
      );
    }
  }
  return problems;
}

/** Rules for build.yml. */
function buildProblems(text) {
  const problems = [];
  const add = (message) => problems.push(`build.yml: ${message}`);
  const src = codeLines(text).join('\n');
  if (
    !/^on:\n {2}workflow_run:\n {4}workflows: \[lint\]\n {4}types: \[completed\]\n {4}branches: \[main\]\n {2}workflow_dispatch:$/m.test(
      src,
    )
  ) {
    add('triggers: workflow_run of lint on main, and workflow_dispatch');
  }
  const jobIf = /^ {4}if: (.+)$/m.exec(src);
  if (!jobIf || jobIf[1] !== BUILD_IF) add(`the job's if: must be exactly: ${BUILD_IF}`);
  if (/\b(always|failure|cancelled)\(\)/.test(src))
    add('no always()/failure()/cancelled() condition in a build');
  if (!/flutter build web -t lib\/main_admin\.dart --release/.test(src)) add('the admin web build');
  if (!/flutter build apk --debug -t lib\/main_mobile\.dart/.test(src)) add('the debug APK build');
  if ([...src.matchAll(/--dart-define=API_BASE=https:\/\/api\.invalid\/api/g)].length !== 2) {
    add('both builds use the placeholder API_BASE');
  }
  for (const define of ['APP_VERSION', 'BUILD_NUMBER', 'GIT_COMMIT', 'BUILD_TIME']) {
    if ([...src.matchAll(new RegExp(`--dart-define=${define}=`, 'g'))].length !== 2)
      add(`${define} is stamped in both builds`);
  }
  if (
    [...src.matchAll(/--build-name=/g)].length !== 2 ||
    [...src.matchAll(/--build-number=/g)].length !== 2
  ) {
    add('--build-name and --build-number in both builds');
  }
  if (!/fetch-depth: 0/.test(src)) add('full history (BUILD_NUMBER counts every commit)');
  if ([...src.matchAll(/retention-days: 3$/gm)].length !== 2) add('both artifacts are kept 3 days');
  if (
    !/actions\/setup-java@[0-9a-f]{40} # v\d+\.\d+\.\d+\n\s+with:\n\s+distribution: temurin\n\s+java-version: '17'/.test(
      src,
    )
  ) {
    add('Java 17 (Temurin) for Gradle');
  }
  if (!/key: flutter-android-/.test(src))
    add("build's Flutter cache has its own key (flutter-android-...)");
  if (!/path: \|\n\s+~\/\.gradle\/caches/.test(src)) add('a Gradle cache');
  return problems;
}

/**
 * Every problem in one workflow file.
 * @param {string} name   lint.yml, e2e.yml or build.yml
 * @param {string} text   the file's text
 * @param {{ checks: string[], databaseChecks: string[], flutterPin: string, setupMinutes: number }} ctx
 */
function checkWorkflow(name, text, ctx) {
  const specific = { 'lint.yml': lintProblems, 'e2e.yml': e2eProblems, 'build.yml': buildProblems }[
    name
  ];
  return [...commonProblems(name, text, ctx), ...(specific ? specific(text, ctx) : [])];
}

/** "3.47" from the Blueprint's pin row ("| Flutter / Dart | Flutter 3.47 / Dart 3.13 | ..."), or null. */
function flutterPinFromBlueprint(blueprint) {
  const m = /\|\s*Flutter \/ Dart\s*\|\s*Flutter (\d+\.\d+)\s*\//.exec(blueprint);
  return m ? m[1] : null;
}

module.exports = {
  checkWorkflow,
  flutterPinFromBlueprint,
  steps,
  runText,
  stepAttr,
  BUILD_IF,
  LINT_CONCURRENCY_GROUP,
  E2E_CONCURRENCY_GROUP,
};
