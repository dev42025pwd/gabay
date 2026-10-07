#!/usr/bin/env node
// npm run verify: the one command that says whether the work is done (standard §7.2, L121, L126,
// L129). It runs every check, cheap ones first, prints one line per check, ends ALL GREEN or lists
// the failures, and exits with the number of failures.
//
//   1  node-version        Node is 22 (otherwise nothing after it can be trusted: stop here)
//   2  node-check          node --check on every .js in functions/, db/tools, db/seeds, tools/, .claude/hooks
//   3  structural-linters  tools/lint/run.js over the whole repo (and its repo-layout line must be present)
//   4  linter-tests        the linters' own tests
//   5  tools-tests         the tests of verify, the fingerprint and the hooks
//   6  eslint              functions/, db/tools, tools/, .claude/hooks with functions' pinned ESLint and config
//   7  prettier            the same folders, with functions' pinned Prettier and config
//   8  api-tests           functions/ tests against the local gabay_dev
//   9  db-tools-tests      the migration runner's tests
//  10  schema-run-1        db/schema.sql applied (setup-db --skip-seed)
//  11  schema-run-2        ... and applied again: it must be re-runnable (standard §8.2)
//  12  seed                the test seed (starts the Auth emulator itself)
//  13  functions-health    the Functions emulator answers GET /api/health { status, db } with an X-Request-Id
//  14  flutter-analyze     app/
//  15  flutter-test        app/
//
// After EVERY run, green or red, .verify/last-run.json records the code fingerprint, the result and
// the failed checks; the Claude Stop hook reads it (L129). --only a,b runs some checks (a "partial"
// run: it never counts as a verify for the Stop hook). Servers a check starts are always stopped, and
// a listener left on their ports is itself a failure. An interrupt stops only what THIS run started
// (its command trees, and the ports of servers it started); a process it did not start is never touched.
//
// TEST SEAMS (used by tools/test, not for normal use): GABAY_VERIFY_EMULATOR_TIMEOUT_MS shortens the
// emulator check's timeout; GABAY_VERIFY_TEST_INTERRUPT_MS makes the run call its Ctrl-C cleanup after
// that many milliseconds, because a real Ctrl-C cannot be sent from a script on Windows.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { fingerprint, writeState, ROOT } = require('./fingerprint');
const { runCommand, killAll, tail, listeners, waitPortsFree, sweepPorts } = require('./lib/proc');

const NODE = `"${process.execPath}"`;
const WINDOWS = process.platform === 'win32';
/** One check may run this long before it is stopped and counted as failed. */
const TIMEOUT_MS = {
  default: 10 * 60_000,
  seed: 10 * 60_000,
  flutterTest: 20 * 60_000,
  // GABAY_VERIFY_EMULATOR_TIMEOUT_MS shortens it so the timeout path can be shown (tools/test).
  emulator: Number(process.env.GABAY_VERIFY_EMULATOR_TIMEOUT_MS) || 3 * 60_000,
};
/** How long a server's ports may stay open after its command ended, before it counts as an orphan. */
const SHUTDOWN_GRACE_MS = 30_000;
/** Firebase emulator ports used by firebase.json (functions) and the seed (auth, hub, logging). */
const FUNCTIONS_PORTS = [5001, 4400, 4500];
const SEED_PORTS = [9099, 4400, 4500];

const STYLE_FOLDERS = ['functions', 'db/tools', 'tools', '.claude/hooks'];
const styleFolders = () => STYLE_FOLDERS.filter((f) => fs.existsSync(path.join(ROOT, f)));

/** Every .js file under dir (skipping node_modules), as repo-relative paths. */
function jsFiles(dir) {
  const base = path.join(ROOT, dir);
  if (!fs.existsSync(base)) return [];
  const out = [];
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.emulator-data')
        out.push(...jsFiles(rel));
    } else if (entry.name.endsWith('.js')) out.push(rel);
  }
  return out;
}

const timed = async (fn) => {
  const start = Date.now();
  const result = await fn();
  return { ...result, seconds: (Date.now() - start) / 1000 };
};

/** How many tests node --test reports (its TAP "# tests N" line, or the spec reporter's "tests N"), or null. */
function testsRan(output) {
  const m = /^(?:#|ℹ)\s+tests\s+(\d+)/m.exec(output);
  return m ? Number(m[1]) : null;
}

/**
 * A check that is one command. With { tests: true } it also fails when the run reports no tests:
 * `node --test "<glob>"` exits 0 when the glob matches nothing, which would pass a check that
 * checked nothing.
 */
const command =
  (commandLine, { cwd = ROOT, timeoutMs = TIMEOUT_MS.default, tests = false } = {}) =>
  async () => {
    const r = await runCommand(commandLine, { cwd, timeoutMs });
    let note = r.timedOut
      ? `\nTIMED OUT after ${timeoutMs / 1000} s; the process tree was stopped.`
      : '';
    let ok = r.code === 0 && !r.timedOut;
    if (ok && tests && !(testsRan(r.output) > 0)) {
      ok = false;
      note += '\nno tests ran (0, or no "# tests" line): the test glob probably matches nothing.';
    }
    return { ok, output: tail(r.output) + note };
  };

/** Ports of servers THIS run has started and not yet seen stop: the only ones an interrupt may sweep. */
const startedPorts = new Set();

/** A check that starts servers: refuses to start on busy ports, and fails if any listener is left. */
const withServers = (ports, run) => async () => {
  const busy = ports.flatMap((port) => listeners(port).map((pid) => `port ${port} (pid ${pid})`));
  if (busy.length) {
    return {
      ok: false,
      output: `Cannot start: ${busy.join(', ')} already in use. Stop that process (an emulator you started?) and run verify again.`,
    };
  }
  // The ports were free a moment ago, so a listener on them from here on is ours.
  ports.forEach((p) => startedPorts.add(p));
  const result = await run();
  await waitPortsFree(ports, SHUTDOWN_GRACE_MS); // a normal shutdown takes a few seconds
  const orphans = sweepPorts(ports);
  ports.forEach((p) => startedPorts.delete(p));
  if (orphans.length) {
    const list = orphans.map((o) => `port ${o.port} pid ${o.pid}`).join(', ');
    return { ok: false, output: `${result.output}\nORPHAN left behind and now stopped: ${list}` };
  }
  return result;
};

function nodeVersion() {
  const major = process.versions.node.split('.')[0];
  return major === '22'
    ? { ok: true, output: '' }
    : {
        ok: false,
        output: `Node ${process.versions.node}: Gabay needs Node 22 (.nvmrc). In Git Bash run: fnm exec --using=22 -- npm.cmd run verify`,
      };
}

/** node --check on one file (no shell). */
function checkSyntax(file) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ['--check', file],
      { cwd: ROOT, timeout: 60_000, windowsHide: true },
      (err, stdout, stderr) => {
        resolve({ ok: !err, output: `${stdout}${stderr}` });
      },
    );
  });
}

async function nodeCheck() {
  const files = [
    ...jsFiles('functions/src'),
    'functions/index.js',
    ...jsFiles('db/tools'),
    ...jsFiles('db/seeds/lib'),
    'db/seeds/seed.js',
    ...jsFiles('tools'),
    ...jsFiles('.claude/hooks'),
  ].filter((f) => fs.existsSync(path.join(ROOT, f)));
  const failures = [];
  // Eight at once, without a shell: one process per file is the literal `node --check`, and quick this way.
  const queue = [...files];
  const worker = async () => {
    for (let file = queue.shift(); file; file = queue.shift()) {
      const r = await checkSyntax(file);
      if (!r.ok) failures.push(`${file}\n${tail(r.output, 6)}`);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return {
    ok: failures.length === 0,
    output: failures.length ? failures.join('\n') : `${files.length} files`,
  };
}

async function structuralLinters() {
  const r = await runCommand(`${NODE} tools/lint/run.js`, { cwd: ROOT });
  // The runner prints "ok   repo-layout" only when db/schema.sql, app/lib and functions/src exist:
  // without it a pass could mean "there was nothing to look at".
  const layoutSeen = /^ok\s+repo-layout/m.test(r.output);
  return {
    ok: r.code === 0 && layoutSeen,
    output:
      tail(r.output) +
      (layoutSeen
        ? ''
        : '\nThe "ok   repo-layout" line is missing: the run did not check the whole repo.'),
  };
}

const eslintCommand = () =>
  `${NODE} functions/node_modules/eslint/bin/eslint.js --config functions/eslint.config.js ${styleFolders().join(' ')}`;

const prettierCommand = () =>
  `${NODE} functions/node_modules/prettier/bin/prettier.cjs --check --config functions/.prettierrc.json --ignore-path functions/.prettierignore ` +
  [
    ...styleFolders().map((f) => `"${f}/**/*.{js,json}"`),
    ...(fs.existsSync(path.join(ROOT, '.claude/settings.json')) ? ['".claude/settings.json"'] : []),
  ].join(' ');

function firebaseBin() {
  const dir = path.join(ROOT, 'db', 'seeds', 'node_modules', '.bin');
  return path.join(dir, WINDOWS ? 'firebase.cmd' : 'firebase');
}

function functionsHealth() {
  const bin = firebaseBin();
  if (!fs.existsSync(bin)) {
    return { ok: false, output: 'firebase-tools is not installed: run npm ci in db/seeds' };
  }
  return withServers(
    FUNCTIONS_PORTS,
    command(
      `"${bin}" emulators:exec --only functions --project demo-gabay "node tools/health-probe.js"`,
      { timeoutMs: TIMEOUT_MS.emulator },
    ),
  )();
}

const CHECKS = [
  { name: 'node-version', run: nodeVersion, fatal: true },
  { name: 'node-check', run: nodeCheck },
  { name: 'structural-linters', run: structuralLinters },
  { name: 'linter-tests', run: command('npm run lint:test', { tests: true }) },
  { name: 'tools-tests', run: command('npm run tools:test', { tests: true }) },
  { name: 'eslint', run: command(eslintCommand()) },
  { name: 'prettier', run: command(prettierCommand()) },
  { name: 'api-tests', run: command('npm run api:test', { tests: true }) },
  { name: 'db-tools-tests', run: command('npm --prefix db/tools test', { tests: true }) },
  { name: 'schema-run-1', run: command('npm run setup-db -- --skip-seed --stop-on-error') },
  { name: 'schema-run-2', run: command('npm run setup-db -- --skip-seed --stop-on-error') },
  {
    name: 'seed',
    run: withServers(SEED_PORTS, command('npm run seed', { timeoutMs: TIMEOUT_MS.seed })),
  },
  { name: 'functions-health', run: functionsHealth },
  { name: 'flutter-analyze', run: command('flutter analyze', { cwd: path.join(ROOT, 'app') }) },
  {
    name: 'flutter-test',
    run: command('flutter test', {
      cwd: path.join(ROOT, 'app'),
      timeoutMs: TIMEOUT_MS.flutterTest,
    }),
  },
];

const pad = (name) => name.padEnd(20);

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--list')) {
    console.log(CHECKS.map((c) => c.name).join('\n'));
    return 0;
  }
  const onlyAt = args.indexOf('--only');
  const only = onlyAt === -1 ? null : (args[onlyAt + 1] ?? '').split(',').filter(Boolean);
  const unknown = (only ?? []).filter((n) => !CHECKS.some((c) => c.name === n));
  if (onlyAt !== -1 && (only.length === 0 || unknown.length)) {
    console.error(
      `--only needs check names (known: ${CHECKS.map((c) => c.name).join(', ')}); unknown: ${unknown.join(', ') || '(none given)'}`,
    );
    return 2;
  }

  const stop = (signal) => {
    console.error(`\n${signal}: stopping every command and server verify started...`);
    killAll();
    sweepPorts([...startedPorts]); // only servers this run started; a foreign listener is never touched
    process.exit(130);
  };
  process.on('SIGINT', () => stop('SIGINT'));
  // A Ctrl-C cannot be scripted from a non-interactive shell on Windows, so a test can ask for the same
  // cleanup after a delay: GABAY_VERIFY_TEST_INTERRUPT_MS (not for normal use).
  if (process.env.GABAY_VERIFY_TEST_INTERRUPT_MS) {
    setTimeout(
      () => stop('TEST-INTERRUPT'),
      Number(process.env.GABAY_VERIFY_TEST_INTERRUPT_MS),
    ).unref();
  }
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('exit', killAll);

  const started = Date.now();
  const printAtStart = fingerprint();
  const selected = CHECKS.filter((c) => !only || only.includes(c.name));
  const results = [];
  for (const check of selected) {
    const r = await timed(() => Promise.resolve(check.run()));
    results.push({ name: check.name, ok: r.ok, seconds: Number(r.seconds.toFixed(1)) });
    console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${pad(check.name)} (${r.seconds.toFixed(1)} s)`);
    if (!r.ok && r.output)
      console.log(
        r.output
          .split('\n')
          .map((l) => `       ${l}`)
          .join('\n'),
      );
    if (!r.ok && check.fatal) break;
  }

  // A result only speaks for the code that was there when the checks ran: if a file changed meanwhile
  // (an edit during the run, or a check that rewrites code), the run cannot be trusted either way.
  const printAtEnd = fingerprint();
  if (printAtEnd !== printAtStart) {
    results.push({ name: 'code-changed-during-run', ok: false, seconds: 0 });
    console.log(
      `FAIL ${pad('code-changed-during-run')} (a code file changed while verify ran; run it again)`,
    );
  }
  const failed = results.filter((r) => !r.ok).map((r) => r.name);
  const total = ((Date.now() - started) / 1000).toFixed(1);
  writeState({
    fingerprint: printAtEnd,
    result: failed.length === 0 ? 'green' : 'red',
    partial: only !== null,
    failed,
    checks: results,
    totalChecks: CHECKS.length,
    finishedAt: new Date().toISOString(),
    seconds: Number(total),
    node: process.versions.node,
  });
  if (failed.length === 0)
    console.log(
      `\nALL GREEN${only ? ' (partial run: only ' + only.join(', ') + ')' : ''}   (${total} s)`,
    );
  else console.log(`\n${failed.length} FAILED: ${failed.join(', ')}   (${total} s)`);
  return Math.min(failed.length, 255);
}

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(err.stack || err);
      killAll();
      process.exit(255);
    },
  );
}

module.exports = { CHECKS, jsFiles };
