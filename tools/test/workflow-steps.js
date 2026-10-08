// The ordered steps of the lint and e2e jobs, pinned (S7 round 3). The gate steps (verify, guards, migrations) are
// pinned on their own in workflow-rules.js, but a step added BEFORE one can switch it off without ever naming it
// (`sed -i '1i process.exit(0);' tools/v*.js`; a fake `node` first on $GITHUB_PATH). So the whole list is pinned:
// every step's name, its own keys, the action it uses (its SHA is pinned by the whole-text snapshot, workflow-snapshot.js, so
// an upgrade changes it too), what it runs, its if: and its shell. Any step added, removed, reordered or rewritten fails the rules.
// When a step here really changes, change this list in the same commit: that is the review the gate needs.
'use strict';

/** The Flutter version, in the pinned text; the real version is checked against the Blueprint by the common rules. */
const FLUTTER = '<flutter>';

const squash = (text) => text.replace(/\s+/g, ' ').trim();

/** lint.yml's job, in order. */
function lintSteps(ctx) {
  const noDatabase = ctx.checks.filter((c) => !ctx.databaseChecks.includes(c)).join(',');
  return [
    { name: 'Check out the repository', keys: 'name,uses,with', uses: 'actions/checkout' },
    {
      name: 'Set up Node.js (the version in .nvmrc)',
      keys: 'name,uses,with',
      uses: 'actions/setup-node',
    },
    {
      name: "Install the API's packages (ESLint and Prettier come from here)",
      keys: 'name,run',
      run: 'npm ci --prefix functions',
    },
    {
      name: "Install the database tools' packages",
      keys: 'name,run',
      run: 'npm ci --prefix db/tools',
    },
    { name: 'Cache Flutter', keys: 'name,id,uses,with', uses: 'actions/cache' },
    {
      name: `Install Flutter ${FLUTTER} (the Blueprint pin)`,
      keys: 'name,if,run',
      if: "steps.flutter-cache.outputs.cache-hit != 'true'",
      run: `git clone --depth 1 --branch ${FLUTTER} https://github.com/flutter/flutter.git "$HOME/flutter"`,
    },
    {
      name: 'Put Flutter on the PATH',
      keys: 'name,run',
      run: 'echo "$HOME/flutter/bin" >> "$GITHUB_PATH"',
    },
    {
      name: 'Cache the Dart and Flutter packages',
      keys: 'name,uses,with',
      uses: 'actions/cache',
    },
    {
      name: 'Secret guard and changelog duplicate guard (the checked-out tree)',
      keys: 'name,run',
      run: 'npm run ci:guards',
    },
    {
      name: 'Committed migrations are never edited (push and pull request)',
      keys: 'name,env,run',
      run: 'node tools/ci-migrations.js',
    },
    {
      name: 'verify, the checks that need no database',
      keys: 'name,run',
      run: `node tools/verify.js --only ${noDatabase}`,
    },
  ];
}

/** e2e.yml's job, in order. */
function e2eSteps(ctx) {
  const database = ctx.checks.filter((c) => ctx.databaseChecks.includes(c)).join(',');
  return [
    { name: 'Check out the repository', keys: 'name,uses', uses: 'actions/checkout' },
    {
      name: 'Set up Node.js (the version in .nvmrc)',
      keys: 'name,uses,with',
      uses: 'actions/setup-node',
    },
    { name: "Install the API's packages", keys: 'name,run', run: 'npm ci --prefix functions' },
    {
      name: "Install the database tools' packages",
      keys: 'name,run',
      run: 'npm ci --prefix db/tools',
    },
    {
      name: "Install the seed's packages (firebase-tools lives here)",
      keys: 'name,run',
      run: 'npm ci --prefix db/seeds',
    },
    {
      name: 'Write .env from throwaway values (no repository secrets, nothing echoed)',
      keys: 'name,shell,run',
      shell: 'bash',
      run: `set -eu umask 077 { echo "PGHOST=localhost" echo "PGPORT=5432" echo "PGDATABASE=gabay_dev" echo "PGUSER=postgres" echo "PGPASSWORD=$DB_PASSWORD" } > .env for account in SUPERADMIN MALLADMIN EDITOR VIEWER MALLADMIN_DEMO SHOPPER; do value="$(openssl rand -hex 16)" echo "::add-mask::$value" echo "SEED_PW_$account=$value" >> .env done`,
    },
    {
      name: 'verify, the database half',
      keys: 'name,shell,run',
      shell: 'bash',
      run: `node tools/verify.js --only ${database} 2>&1 | tee verify.log`,
    },
    {
      name: 'Collect the PostgreSQL service log (on failure or cancel)',
      keys: 'name,if,shell,run',
      if: 'failure() || cancelled()',
      shell: 'bash',
      run: 'id="$(docker ps -aq --filter ancestor=postgres:18 | head -n 1)" if [ -n "$id" ]; then docker logs "$id" > postgres.log 2>&1 else echo "no postgres:18 container found: there is no service log to collect" fi',
    },
    {
      name: 'Upload the server and emulator logs (on failure or cancel)',
      keys: 'name,if,uses,with',
      if: 'failure() || cancelled()',
      uses: 'actions/upload-artifact',
    },
  ];
}

/** The pinned steps of a workflow, or null when its steps are not pinned (build.yml). */
function pinnedSteps(name, ctx) {
  if (name === 'lint.yml') return lintSteps(ctx);
  if (name === 'e2e.yml') return e2eSteps(ctx);
  return null;
}

/**
 * What identifies a step in the file: the same fields the pinned list holds, read from the step's text.
 * `readers` are workflow-rules.js's (runText, stepAttr, stepKeys), passed in so the two files do not require
 * each other.
 */
function identify(stepLines, readers, flutterVersion) {
  const { runText, stepAttr, stepKeys } = readers;
  const unflutter = (s) => (flutterVersion ? s.split(flutterVersion).join(FLUTTER) : s);
  const run = runText(stepLines);
  const uses = stepAttr(stepLines, 'uses');
  const when = stepAttr(stepLines, 'if');
  const shell = stepAttr(stepLines, 'shell');
  return {
    name: unflutter((stepAttr(stepLines, 'name') ?? '').trim()),
    keys: stepKeys(stepLines).join(','),
    ...(uses === null ? {} : { uses: uses.split('@')[0].trim() }),
    ...(run === null ? {} : { run: unflutter(squash(run)) }),
    ...(when === null ? {} : { if: when }),
    ...(shell === null ? {} : { shell }),
  };
}

/**
 * The problems of a workflow's step list against the pinned one: the names in order first (an added, removed or
 * reordered step), then every step's own fields.
 */
function stepListProblems(name, stepList, ctx, readers, flutterVersion) {
  const pinned = pinnedSteps(name, ctx);
  if (!pinned) return [];
  const found = stepList.map((st) => identify(st, readers, flutterVersion));
  const expectedNames = pinned.map((p) => p.name);
  const foundNames = found.map((f) => f.name);
  if (expectedNames.join('\n') !== foundNames.join('\n')) {
    const show = (names) => names.map((n) => `"${n}"`).join(' | ');
    return [
      `${name}: step list: the job's steps must be, in this order: ${show(expectedNames)}; found: ${show(foundNames)}`,
    ];
  }
  const problems = [];
  pinned.forEach((want, i) => {
    const have = found[i];
    for (const field of ['keys', 'uses', 'run', 'if', 'shell']) {
      const expected = want[field] === undefined ? undefined : squash(want[field]);
      if (expected !== have[field]) {
        problems.push(
          `${name}: step "${want.name}": ${field} must be ${JSON.stringify(expected)}, found ${JSON.stringify(have[field])} (the pinned step list, tools/test/workflow-steps.js)`,
        );
      }
    }
  });
  return problems;
}

module.exports = { stepListProblems, pinnedSteps };
