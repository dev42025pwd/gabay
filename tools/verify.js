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
//   8  schema-run-1        db/schema.sql applied (setup-db --skip-seed)
//   9  schema-run-2        ... and applied again: it must be re-runnable (standard §8.2)
//  10  api-tests           functions/ tests against the copy's database (PGDATABASE; the schema is there since 8 and 9)
//  11  db-tools-tests      the migration runner's tests
//  12  seed                the test seed (starts the Auth emulator itself)
//                          (afterwards: a leftover firebase-export-* folder in db/seeds is restored or removed, with a line)
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
// GABAY_VERIFY_CHECK_TIMEOUT_MS (CI only) caps every check's own timeout, so a hung check fails with its
// output before the CI job's timeout cancels the run.
//
// A FAILING CHECK'S WHOLE OUTPUT IS KEPT (plan/PH1-verify-logs.md): the console shows its last 30 lines, and
// everything it printed is saved first to .verify/logs/<check>.log (tools/lib/verify-logs.js; at most 5 MB, the
// start and the end past that). The FAIL line names the file. A run empties that folder right after it has the
// lock, so it holds the latest run's failures only and a green run leaves it empty. --list never touches it.
//
// ONE RUN AT A TIME (plan/PH1-verify-lock.md): every run, a partial one too, takes a lock for the whole machine
// (tools/lib/verify-lock.js) before its first check, because all runs share the emulator ports (each working copy
// has its own database, plan/PH1-worktrees.md). A second run prints who holds it and waits; after GABAY_VERIFY_LOCK_WAIT_MS (default 15 minutes) it stops with
// exit 2, and records nothing. GABAY_VERIFY_OWNER names the run in the lock (for example "api-coder"). The lock
// is released on every way out of this process: the end, a failed check, Ctrl-C, SIGTERM and SIGHUP. --list and CI
// (CI=true: a fresh runner, one job) take no lock.
//
// TEST SEAMS (used by tools/test, not for normal use): GABAY_VERIFY_EMULATOR_TIMEOUT_MS shortens the
// emulator check's timeout; GABAY_VERIFY_TEST_INTERRUPT_MS makes the run call its Ctrl-C cleanup after
// that many milliseconds, because a real Ctrl-C cannot be sent from a script on Windows;
// GABAY_VERIFY_TEST_INTERRUPT_FILE does the same when that file appears; GABAY_VERIFY_LOCK_FILE and
// GABAY_VERIFY_LOCK_REPORT_MS move the lock and shorten its reminder.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { fingerprint, writeState, ROOT } = require('./fingerprint');
const {
  runCommand,
  killAll,
  tail,
  listeners,
  waitPortsFree,
  sweepPorts,
  ownerText,
} = require('./lib/proc');
const {
  lockFilePath,
  readWaitLimit,
  readReportInterval,
  acquireLock,
  releaseLock,
} = require('./lib/verify-lock');
const { resetLogs, writeLog } = require('./lib/verify-logs');

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
/**
 * How many lines of a failing check's output are printed. Locally the last 30 are enough to read; in CI
 * (GitHub sets CI=true) the log is all there is afterwards, so the whole output is kept (the runner already
 * caps it at 1 MB).
 */
const TAIL_LINES = process.env.CI === 'true' ? Number.MAX_SAFE_INTEGER : 30;
/**
 * GABAY_VERIFY_CHECK_TIMEOUT_MS caps EVERY check's timeout (CI sets it, S7 review I4): the CI job has its own
 * timeout, and a check allowed ten minutes would be cut off by the job (a cancelled run, no output) before
 * its own limit could fire and print what it had.
 */
let checkTimeoutCapMs = Infinity;
/** The cap from the environment: Infinity when unset or empty; an error for anything but a positive whole number. */
function readCheckTimeoutCap(raw = process.env.GABAY_VERIFY_CHECK_TIMEOUT_MS) {
  if (raw === undefined || raw === '') return Infinity;
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(
      `GABAY_VERIFY_CHECK_TIMEOUT_MS must be a positive whole number of milliseconds, got "${raw}"`,
    );
  }
  return Number(raw);
}
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

/** A folder firebase-tools' HubExport exports into before moving it to .emulator-data: firebase-export-<ms><random>. */
const EXPORT_LEFTOVER = /^firebase-export-.+$/;
/**
 * An export folder with anything modified more recently than this may still be written, or be a finished export its
 * owner is about to move (HubExport removes .emulator-data first and moves the folder after): the repair leaves it
 * alone (S7 round 5). The export of Gabay's seed is a few small files, written in well under a second.
 */
const EXPORT_SETTLE_MS = 2 * 60_000;
/** The seed's emulator ports (hub and Auth): while either has a listener an export may be running. */
const EXPORT_PORTS = [4400, 9099];

/** The newest modification time (ms) of a folder and everything inside it. */
function newestMtime(folder) {
  let newest = fs.lstatSync(folder).mtimeMs;
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(full) : fs.lstatSync(full).mtimeMs);
  }
  return newest;
}

/**
 * True when the folder holds a usable emulator export: a firebase-export-metadata.json that parses to an object,
 * and the auth_export/ folder it describes (a metadata file alone is not an export).
 */
function isValidExport(folder) {
  try {
    const text = fs.readFileSync(path.join(folder, 'firebase-export-metadata.json'), 'utf8');
    const meta = JSON.parse(text);
    const isObject = meta !== null && typeof meta === 'object' && !Array.isArray(meta);
    return isObject && fs.statSync(path.join(folder, 'auth_export')).isDirectory();
  } catch {
    return false;
  }
}

/**
 * After the seed check (S7 round 4): firebase-tools 15.32.1 exports on exit into a temporary firebase-export-*
 * folder in db/seeds, then removes .emulator-data and moves the folder into its place (HubExport). On Windows that
 * move failed once and left .emulator-data missing and the folder behind. So: when .emulator-data is missing, the
 * newest leftover with a valid firebase-export-metadata.json becomes .emulator-data; every other firebase-export-*
 * folder is deleted. Only direct subfolders of seedsDir with that name are touched. One line says what was done;
 * nothing is printed when there is nothing to do. Returns { restored: <folder name or null>, removed: [names] }.
 *
 * It never touches a live export (S7 round 5): it does nothing at all while a listener holds one of EXPORT_PORTS,
 * and while any leftover has a file modified less than EXPORT_SETTLE_MS ago (the newest mtime INSIDE the folder, not
 * the folder's own); then one line says it left them alone. The ports are only asked about when there is a leftover.
 * @param {{ now?: number, listening?: (port: number) => number[] }} [options]  injectable for tests
 */
function repairSeedExport(
  seedsDir,
  log = console.log,
  { now = Date.now(), listening = listeners } = {},
) {
  const none = { restored: null, removed: [] };
  let names;
  try {
    names = fs.readdirSync(seedsDir);
  } catch {
    return none;
  }
  const leftovers = names
    .filter((n) => EXPORT_LEFTOVER.test(n))
    .map((name) => ({ name, folder: path.join(seedsDir, name) }))
    .filter((l) => fs.lstatSync(l.folder).isDirectory())
    .map((l) => ({ ...l, mtime: newestMtime(l.folder) }))
    .sort((a, b) => b.mtime - a.mtime || (a.name < b.name ? 1 : -1)); // newest first
  if (leftovers.length === 0) return none;

  const alone = `verify: left ${leftovers.length} firebase-export folder(s) in db/seeds alone`;
  const busy = EXPORT_PORTS.flatMap((port) => listening(port).map((pid) => ({ port, pid })));
  if (busy.length > 0) {
    const [first] = busy;
    log(
      `${alone}: port ${first.port} (${ownerText(first.pid)}) has a listener, so an export may be running`,
    );
    return { ...none, skipped: 'listener' };
  }
  if (leftovers.some((l) => now - l.mtime < EXPORT_SETTLE_MS)) {
    log(
      `${alone}: one was modified less than ${EXPORT_SETTLE_MS / 1000} s ago, so an export may still be running`,
    );
    return { ...none, skipped: 'recent' };
  }

  const target = path.join(seedsDir, '.emulator-data');
  let restored = null;
  if (!fs.existsSync(target)) {
    const best = leftovers.find((l) => isValidExport(l.folder));
    if (best) {
      fs.renameSync(best.folder, target);
      restored = best.name;
    }
  }
  const removed = [];
  for (const l of leftovers) {
    if (l.name === restored) continue;
    fs.rmSync(l.folder, { recursive: true, force: true });
    removed.push(l.name);
  }
  const gone = removed.length
    ? `removed ${removed.length} leftover firebase-export folder(s) in db/seeds`
    : '';
  if (restored) {
    const also = gone ? `; ${gone}` : '';
    log(`verify: db/seeds/.emulator-data was missing; restored it from ${restored}${also}`);
  } else if (!fs.existsSync(target)) {
    log(`verify: ${gone}; db/seeds/.emulator-data is still missing (none held a valid export)`);
  } else {
    log(`verify: ${gone}`);
  }
  return { restored, removed };
}

/** Work done right after a check, by check name. */
const AFTER_CHECK = { seed: () => repairSeedExport(path.join(ROOT, 'db', 'seeds')) };

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
 * What a check returns: { ok, output, full? }. `output` is what the console shows (the tail); `full` is
 * everything the check had, saved to .verify/logs/<check>.log when it fails (`output` when there is no `full`).
 *
 * A check that is one command. With { tests: true } it also fails when the run reports no tests:
 * `node --test "<glob>"` exits 0 when the glob matches nothing, which would pass a check that
 * checked nothing.
 */
const timedOutNote = (timeoutMs) =>
  `\nTIMED OUT after ${timeoutMs / 1000} s; the process tree was stopped.`;

const command =
  (commandLine, { cwd = ROOT, timeoutMs: ownTimeoutMs = TIMEOUT_MS.default, tests = false } = {}) =>
  async () => {
    const timeoutMs = Math.min(ownTimeoutMs, checkTimeoutCapMs);
    const r = await runCommand(commandLine, { cwd, timeoutMs });
    let note = r.timedOut ? timedOutNote(timeoutMs) : '';
    let ok = r.code === 0 && !r.timedOut;
    if (ok && tests && !(testsRan(r.output) > 0)) {
      ok = false;
      note += '\nno tests ran (0, or no "# tests" line): the test glob probably matches nothing.';
    }
    return { ok, output: tail(r.output, TAIL_LINES) + note, full: r.output + note };
  };

/** Ports of servers THIS run has started and not yet seen stop: the only ones an interrupt may sweep. */
const startedPorts = new Set();

/**
 * A check that starts servers: refuses to start on busy ports, and fails if any listener is left.
 * `graceMs` is how long the ports may stay open after the command ended (a test shortens it).
 */
const withServers =
  (ports, run, graceMs = SHUTDOWN_GRACE_MS) =>
  async () => {
    const busy = ports.flatMap((port) =>
      listeners(port).map((pid) => `port ${port} (${ownerText(pid)})`),
    );
    if (busy.length) {
      return {
        ok: false,
        output: `Cannot start: ${busy.join(', ')} already in use. Stop that process (an emulator you started?) and run verify again.`,
      };
    }
    // The ports were free a moment ago, so a listener on them from here on is ours.
    ports.forEach((p) => startedPorts.add(p));
    const result = await run();
    await waitPortsFree(ports, graceMs); // a normal shutdown takes a few seconds
    const orphans = sweepPorts(ports);
    ports.forEach((p) => startedPorts.delete(p));
    if (orphans.length) {
      const list = orphans.map((o) => `port ${o.port} ${ownerText(o.pid)}`).join(', ');
      const orphanLine = `\nORPHAN left behind (stopped when its pid could be read): ${list}`;
      return {
        ok: false,
        output: result.output + orphanLine,
        full: (result.full ?? result.output) + orphanLine,
      };
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

/** One `node --check` may run this long; GABAY_VERIFY_CHECK_TIMEOUT_MS caps it like every check. */
const NODE_CHECK_TIMEOUT_MS = 60_000;

/** node --check on one file (no shell). A file whose check was cut off says so in its output. */
function checkSyntax(file) {
  const timeoutMs = Math.min(NODE_CHECK_TIMEOUT_MS, checkTimeoutCapMs);
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ['--check', file],
      { cwd: ROOT, timeout: timeoutMs, windowsHide: true },
      (err, stdout, stderr) => {
        const note = err?.killed ? timedOutNote(timeoutMs) : '';
        resolve({ ok: !err, output: `${stdout}${stderr}${note}` });
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
  const wholeFailures = [];
  // Eight at once, without a shell: one process per file is the literal `node --check`, and quick this way.
  const queue = [...files];
  const worker = async () => {
    for (let file = queue.shift(); file; file = queue.shift()) {
      const r = await checkSyntax(file);
      if (!r.ok) {
        failures.push(`${file}\n${tail(r.output, 6)}`);
        wholeFailures.push(`${file}\n${r.output.trimEnd()}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return {
    ok: failures.length === 0,
    output: failures.length ? failures.join('\n') : `${files.length} files`,
    full: wholeFailures.join('\n'),
  };
}

async function structuralLinters() {
  const timeoutMs = Math.min(TIMEOUT_MS.default, checkTimeoutCapMs);
  const r = await runCommand(`${NODE} tools/lint/run.js`, { cwd: ROOT, timeoutMs });
  // The runner prints "ok   repo-layout" only when db/schema.sql, app/lib and functions/src exist:
  // without it a pass could mean "there was nothing to look at".
  const layoutSeen = /^ok\s+repo-layout/m.test(r.output);
  let note = r.timedOut ? timedOutNote(timeoutMs) : '';
  if (!layoutSeen && !r.timedOut) {
    note += '\nThe "ok   repo-layout" line is missing: the run did not check the whole repo.';
  }
  return {
    ok: r.code === 0 && layoutSeen && !r.timedOut,
    output: tail(r.output, TAIL_LINES) + note,
    full: r.output + note,
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
  // The schema runs come BEFORE the tests that read the database: on a fresh database (CI) the API tests
  // need the gabay schema to exist (S7 review I1). The order here is the order of every run, whatever
  // order --only names the checks in.
  { name: 'schema-run-1', run: command('npm run setup-db -- --skip-seed --stop-on-error') },
  { name: 'schema-run-2', run: command('npm run setup-db -- --skip-seed --stop-on-error') },
  { name: 'api-tests', run: command('npm run api:test', { tests: true }) },
  { name: 'db-tools-tests', run: command('npm --prefix db/tools test', { tests: true }) },
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

/** The signals that stop a run cleanly: Ctrl-C, termination, and a closed terminal (SIGHUP). */
const STOP_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];

/** The verify lock this process holds, or null (GitHub's runners and a run that has not got it yet hold none). */
let heldLock = null;
function releaseHeldLock() {
  releaseLock(heldLock);
  heldLock = null;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--list')) {
    // --list alone: with anything else it would print and exit 0 having run nothing.
    if (args.length !== 1) {
      console.error('--list takes no other argument');
      return 2;
    }
    console.log(CHECKS.map((c) => c.name).join('\n'));
    return 0;
  }
  let lockWaitMs;
  try {
    checkTimeoutCapMs = readCheckTimeoutCap();
    lockWaitMs = readWaitLimit();
  } catch (err) {
    console.error(err.message);
    return 2;
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
    releaseHeldLock();
    process.exit(130);
  };
  // A Ctrl-C cannot be scripted from a non-interactive shell on Windows, so a test can ask for the same
  // cleanup after a delay: GABAY_VERIFY_TEST_INTERRUPT_MS (not for normal use).
  if (process.env.GABAY_VERIFY_TEST_INTERRUPT_MS) {
    setTimeout(
      () => stop('TEST-INTERRUPT'),
      Number(process.env.GABAY_VERIFY_TEST_INTERRUPT_MS),
    ).unref();
  }
  // The same, when a file appears: GABAY_VERIFY_TEST_INTERRUPT_FILE (a test that must interrupt at a known moment,
  // not after a guess of how long the run needs to get there; not for normal use).
  if (process.env.GABAY_VERIFY_TEST_INTERRUPT_FILE) {
    const trigger = process.env.GABAY_VERIFY_TEST_INTERRUPT_FILE;
    setInterval(() => fs.existsSync(trigger) && stop('TEST-INTERRUPT'), 100).unref();
  }
  for (const signal of STOP_SIGNALS) process.on(signal, () => stop(signal));
  process.on('exit', () => {
    killAll();
    releaseHeldLock(); // the backstop for every other way out (an error, a plain exit)
  });

  // After the signal handlers, so a Ctrl-C while waiting stops cleanly; before anything else that touches the
  // database or the ports. CI has a fresh runner and one job: no lock there.
  if (process.env.CI !== 'true') {
    const got = await acquireLock({
      file: lockFilePath(),
      root: ROOT,
      waitMs: lockWaitMs,
      reportMs: readReportInterval(),
    });
    if (got.timedOut) {
      console.error(got.message);
      return 2; // not a verify run: nothing is recorded
    }
    heldLock = got.handle;
  }

  // The logs hold the latest run's failures only: emptied once this run has the lock (a run that waits must not
  // wipe what the run ahead of it left), and never by --list, which returned above.
  const reset = resetLogs(ROOT);
  if (reset.error) console.log(`verify: could not empty .verify/logs: ${reset.error}`);

  const started = Date.now();
  const printAtStart = fingerprint();
  const selected = CHECKS.filter((c) => !only || only.includes(c.name));
  const results = [];
  for (const check of selected) {
    const r = await timed(() => Promise.resolve(check.run()));
    results.push({ name: check.name, ok: r.ok, seconds: Number(r.seconds.toFixed(1)) });
    // A failing check's whole output goes to its log BEFORE the console shows the tail of it.
    const saved = r.ok ? null : writeLog(ROOT, check.name, r.full ?? r.output ?? '');
    const where = !saved
      ? ''
      : saved.error
        ? `  (could not save the full output: ${saved.error})`
        : `  full output: ${saved.file} (${saved.lines} lines)`;
    console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${pad(check.name)} (${r.seconds.toFixed(1)} s)${where}`);
    if (!r.ok && r.output)
      console.log(
        r.output
          .split('\n')
          .map((l) => `       ${l}`)
          .join('\n'),
      );
    try {
      AFTER_CHECK[check.name]?.();
    } catch (err) {
      console.log(`verify: the repair after ${check.name} failed: ${err.message}`);
    }
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

module.exports = {
  CHECKS,
  withServers,
  jsFiles,
  repairSeedExport,
  AFTER_CHECK,
  EXPORT_SETTLE_MS,
  STOP_SIGNALS,
};
