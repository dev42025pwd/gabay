// A failing check's whole output is kept (plan/PH1-verify-logs.md): `npm run verify` prints the last 30 lines of a
// failing check, and saves everything the check printed to .verify/logs/<check>.log, so a failure that cannot be
// reproduced can still be read in full. Each test runs a scratch copy of verify (verify-scratch.js), so the real
// .verify/ is never touched.
//
// Written before the logs existed: every test here failed on the code of d25dc86 (no logs, and runCommand dropped
// the start of an output past 2 MB), except the ones noted "passes either way" in their comment.
'use strict';

const test = require('./timeout');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  scratch,
  verify,
  startVerify,
  sleep,
  waitUntil,
  liveHolder,
  holderRecord,
  writeLock,
  clean,
} = require('./verify-scratch');
const { OUTPUT_CAP_CHARS, boundedOutput, capText, runCommand } = require('../lib/proc');
const { logsDir, resetLogs, writeLog } = require('../lib/verify-logs');
const { withServers } = require('../verify');

const NODE = `"${process.execPath}"`;
const logFile = (dir, name) => path.join(dir, '.verify', 'logs', `${name}.log`);
const logNames = (dir) => fs.readdirSync(path.join(dir, '.verify', 'logs')).sort();

/** A "linter-tests" check that prints 100 numbered lines and a "# tests 1" line, then ends with `exit`. */
const noisyCheck = (exit = 1) => ({
  'package.json': JSON.stringify({ scripts: { 'lint:test': 'node noisy.js' } }),
  'noisy.js': `for (let i = 1; i <= 100; i += 1) console.log('line ' + i);\nconsole.log('# tests 1');\nprocess.exitCode = ${exit};\n`,
});

function freePort() {
  return new Promise((resolve) => {
    const server = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** True when something accepts connections on the port. */
const listening = (port) =>
  new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.on('connect', () => (socket.destroy(), resolve(true)));
    socket.on('error', () => resolve(false));
  });

// ---- 1. a failing check leaves its whole output ---------------------------------------------------------------

test('a failing check leaves .verify/logs/<check>.log with its whole output, and its FAIL line names the file; the console still shows the last 30 lines', () => {
  const dir = scratch(noisyCheck());
  try {
    const r = verify(dir, ['--only', 'linter-tests']);
    assert.equal(r.status, 1, r.out + r.err);
    assert.match(r.out, /^FAIL linter-tests\s.*\.verify\/logs\/linter-tests\.log/m);
    assert.doesNotMatch(r.out, /line 50\b/, 'the console keeps only the tail');
    assert.match(r.out, /line 100/);
    const log = fs.readFileSync(logFile(dir, 'linter-tests'), 'utf8');
    const lines = log.split(/\r?\n/);
    const first = lines.indexOf('line 1'); // npm prints a short banner before the check's own output
    assert.ok(first >= 0 && first <= 4, 'the check output starts at the top of the log');
    assert.deepEqual(
      lines.slice(first, first + 101),
      [...Array.from({ length: 100 }, (_, i) => `line ${i + 1}`), '# tests 1'],
      'every line the check printed, in order',
    );
    assert.ok(lines.length > 30, `${lines.length} lines`);
    const counted = /^FAIL linter-tests\s.*\((\d+) lines\)/m.exec(r.out);
    assert.equal(
      Number(counted?.[1]),
      log.replace(/\r?\n$/, '').split('\n').length,
      'the FAIL line says how long the log is',
    );
    assert.deepEqual(logNames(dir), ['linter-tests.log'], 'one file, for the failing check only');
  } finally {
    clean(dir);
  }
});

test('a green check leaves no log, and the failing one beside it does', () => {
  const dir = scratch({
    ...noisyCheck(1),
    'functions/src/ok.js': "'use strict';\n",
  });
  try {
    const r = verify(dir, ['--only', 'node-check,linter-tests']);
    assert.equal(r.status, 1, r.out + r.err);
    assert.deepEqual(logNames(dir), ['linter-tests.log']);
  } finally {
    clean(dir);
  }
});

// ---- 2. only the latest run's failures ------------------------------------------------------------------------

test('a green run empties .verify/logs/, including after a red run (and an old file that no run wrote)', () => {
  const dir = scratch(noisyCheck(1));
  try {
    const red = verify(dir, ['--only', 'linter-tests']);
    assert.equal(red.status, 1, red.out);
    fs.writeFileSync(path.join(dir, '.verify', 'logs', 'old.log'), 'from some run before');
    assert.deepEqual(logNames(dir), ['linter-tests.log', 'old.log']);
    fs.writeFileSync(path.join(dir, 'noisy.js'), "console.log('# tests 1');\n");
    const green = verify(dir, ['--only', 'linter-tests']);
    assert.equal(green.status, 0, green.out);
    assert.deepEqual(logNames(dir), [], 'the directory is there and empty');
  } finally {
    clean(dir);
  }
});

test('a green run on a tree that never had logs leaves .verify/logs/ there and empty', () => {
  const dir = scratch();
  try {
    const r = verify(dir, ['--only', 'node-version']);
    assert.equal(r.status, 0, r.out);
    assert.deepEqual(logNames(dir), []);
  } finally {
    clean(dir);
  }
});

test('a red run replaces the logs of the run before: a check that failed last time and passes now has no log', () => {
  const dir = scratch({ ...noisyCheck(1), 'functions/src/broken.js': 'const = ;\n' });
  try {
    const first = verify(dir, ['--only', 'node-check,linter-tests']);
    assert.equal(first.status, 2, first.out);
    assert.deepEqual(logNames(dir), ['linter-tests.log', 'node-check.log']);
    fs.rmSync(path.join(dir, 'functions'), { recursive: true });
    const second = verify(dir, ['--only', 'node-check,linter-tests']);
    assert.equal(second.status, 1, second.out);
    assert.deepEqual(logNames(dir), ['linter-tests.log'], 'node-check passes now: its log is gone');
  } finally {
    clean(dir);
  }
});

test('--list never touches the logs', () => {
  const dir = scratch(noisyCheck(1));
  try {
    verify(dir, ['--only', 'linter-tests']);
    const before = fs.readFileSync(logFile(dir, 'linter-tests'), 'utf8');
    const r = verify(dir, ['--list']);
    assert.equal(r.status, 0, r.err);
    assert.equal(fs.readFileSync(logFile(dir, 'linter-tests'), 'utf8'), before);
  } finally {
    clean(dir);
  }
});

// Passes either way (the old code never touched the logs): a run that gave up waiting is not a verify run.
test('a run that gives up waiting for the lock leaves the logs alone', () => {
  const dir = scratch();
  const holder = liveHolder();
  try {
    fs.mkdirSync(path.join(dir, '.verify', 'logs'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.verify', 'logs', 'earlier.log'), 'the run before');
    writeLock(dir, holderRecord(holder.pid));
    const r = verify(dir, ['--only', 'node-version'], {
      env: { GABAY_VERIFY_LOCK_WAIT_MS: '1500', GABAY_VERIFY_LOCK_REPORT_MS: '400' },
    });
    assert.equal(r.status, 2, r.out + r.err);
    assert.deepEqual(logNames(dir), ['earlier.log']);
  } finally {
    holder.kill();
    clean(dir);
  }
});

test("the logs are emptied only AFTER the lock is taken: while a run waits for another, the other run's logs are still there", async () => {
  const dir = scratch();
  const holder = liveHolder();
  try {
    fs.mkdirSync(path.join(dir, '.verify', 'logs'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.verify', 'logs', 'holders-run.log'), 'a failure being read');
    writeLock(dir, holderRecord(holder.pid));
    const run = startVerify(dir, ['--only', 'node-version'], {
      env: { GABAY_VERIFY_LOCK_WAIT_MS: '60000', GABAY_VERIFY_LOCK_REPORT_MS: '300' },
    });
    assert.ok(
      await waitUntil(() => /verify is busy/.test(run.output().out)),
      'it waits on the live holder',
    );
    await sleep(500);
    assert.deepEqual(logNames(dir), ['holders-run.log'], 'still there while it waits');
    holder.kill(); // the holder's process ends: the lock is stale, and the waiting run takes it
    const r = await run.done;
    assert.equal(r.status, 0, r.out + r.err);
    assert.deepEqual(logNames(dir), [], 'emptied once it ran');
  } finally {
    holder.kill();
    clean(dir);
  }
});

// ---- 3. every failing path ------------------------------------------------------------------------------------

test("a timed-out check's output is saved, with the TIMED OUT line", () => {
  const dir = scratch({
    'package.json': JSON.stringify({ scripts: { 'lint:test': 'node hang.js' } }),
    'hang.js':
      "for (let i = 1; i <= 60; i += 1) console.log('before the hang ' + i);\nconsole.log('# tests 1');\nsetTimeout(() => {}, 120000);\n",
  });
  try {
    const r = verify(dir, ['--only', 'linter-tests'], {
      env: { GABAY_VERIFY_CHECK_TIMEOUT_MS: '10000' },
    });
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /^FAIL linter-tests\s.*\.verify\/logs\/linter-tests\.log/m);
    const log = fs.readFileSync(logFile(dir, 'linter-tests'), 'utf8');
    assert.match(log, /^before the hang 1$/m, 'the start, which the 30-line tail cut');
    assert.match(log, /^before the hang 60$/m);
    assert.match(log, /TIMED OUT after 10 s/);
  } finally {
    clean(dir);
  }
});

test('a check that ran no tests saves its output and the "no tests ran" note', () => {
  const dir = scratch({
    'package.json': JSON.stringify({ scripts: { 'lint:test': 'node quiet.js' } }),
    'quiet.js': "console.log('nothing here');\n",
  });
  try {
    const r = verify(dir, ['--only', 'linter-tests']);
    assert.equal(r.status, 1, r.out);
    const log = fs.readFileSync(logFile(dir, 'linter-tests'), 'utf8');
    assert.match(log, /nothing here/);
    assert.match(log, /no tests ran/);
  } finally {
    clean(dir);
  }
});

test('node-version, node-check, structural-linters and a missing firebase-tools each save what they said', () => {
  const dir = scratch({
    'functions/src/broken.js': 'const = ;\n',
    'tools/lint/run.js': "console.log('ok   schema-drops');\n",
  });
  const preload = path.join(dir, 'fake-node.js');
  fs.writeFileSync(
    preload,
    "Object.defineProperty(process.versions, 'node', { value: '24.1.0' });\n",
  );
  try {
    const wrong = verify(dir, ['--only', 'node-version'], { preload });
    assert.equal(wrong.status, 1, wrong.out);
    assert.match(wrong.out, /^FAIL node-version\s.*\.verify\/logs\/node-version\.log/m);
    assert.match(fs.readFileSync(logFile(dir, 'node-version'), 'utf8'), /Gabay needs Node 22/);

    const r = verify(dir, ['--only', 'node-check,structural-linters,functions-health']);
    assert.equal(r.status, 3, r.out);
    assert.deepEqual(logNames(dir), [
      'functions-health.log',
      'node-check.log',
      'structural-linters.log',
    ]);
    // node --check prints the file and line first; the console's 6-line tail may cut it, the log never does.
    assert.match(fs.readFileSync(logFile(dir, 'node-check'), 'utf8'), /broken\.js:1\r?\n/);
    assert.match(
      fs.readFileSync(logFile(dir, 'structural-linters'), 'utf8'),
      /ok {3}schema-drops[\s\S]*"ok {3}repo-layout" line is missing/,
    );
    assert.match(
      fs.readFileSync(logFile(dir, 'functions-health'), 'utf8'),
      /firebase-tools is not installed/,
    );
  } finally {
    clean(dir);
  }
});

test('a server check that cannot start (busy port) saves its message', async () => {
  const port = await freePort();
  const holder = await new Promise((resolve) => {
    const server = net.createServer().listen(port, '127.0.0.1', () => resolve(server));
  });
  try {
    const r = await withServers([port], async () => ({ ok: true, output: 'never runs' }))();
    assert.equal(r.ok, false);
    assert.match(r.output, /Cannot start: port \d+ \(pid \d+\) already in use/);
    assert.equal((r.full ?? r.output).includes('Cannot start'), true);
  } finally {
    holder.close();
  }
});

test('a server check that leaves an orphan keeps the WHOLE output of its command in the saved text, plus the orphan line', async () => {
  const port = await freePort();
  const whole = Array.from({ length: 80 }, (_, i) => `server line ${i + 1}`).join('\n');
  let orphan;
  const r = await withServers(
    [port],
    async () => {
      orphan = spawn(
        process.execPath,
        [
          '-e',
          `require('net').createServer().listen(${port}, '127.0.0.1'); setInterval(() => {}, 1000)`,
        ],
        { stdio: 'ignore' },
      );
      assert.ok(await waitUntil(() => listening(port)), 'the orphan is listening');
      return { ok: true, output: 'last 30 only', full: whole };
    },
    500, // the grace before a listener counts as an orphan (the real one is 30 s)
  )();
  try {
    assert.equal(r.ok, false);
    assert.match(r.output, /ORPHAN left behind/);
    assert.match(r.full, /^server line 1\n/, 'the start of the command output survives');
    assert.match(r.full, /server line 80\nORPHAN left behind/);
  } finally {
    orphan?.kill();
  }
});

// ---- 4. the size cap ------------------------------------------------------------------------------------------

test('the cap is 5 MB', () => {
  assert.equal(OUTPUT_CAP_CHARS, 5 * 1024 * 1024);
});

test('capText keeps text within the cap whole, and past it keeps the head and the tail with a "cut" line saying how much', () => {
  assert.equal(capText('x'.repeat(100), 100), 'x'.repeat(100), 'exactly at the cap: unchanged');
  const text = `${'H'.repeat(50)}${'m'.repeat(900)}${'T'.repeat(50)}`; // 1000 characters
  const cut = capText(text, 100);
  assert.ok(cut.startsWith('H'.repeat(50)), 'the start is kept');
  assert.ok(cut.endsWith('T'.repeat(50)), 'the end is kept');
  assert.doesNotMatch(cut, /m{10}/, 'the middle is gone');
  assert.match(cut, /cut 900 characters/);
  assert.ok(cut.length < 100 + 200, 'the cap plus one short line');
});

test('boundedOutput gives the same text from many small chunks as capText from the whole', () => {
  const text = Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n');
  const buf = boundedOutput(400);
  for (let i = 0; i < text.length; i += 7) buf.add(text.slice(i, i + 7));
  assert.equal(buf.text(), capText(text, 400));
  const small = boundedOutput(400);
  small.add('short');
  assert.equal(small.text(), 'short');
});

test('an output past the cap is saved with its start and its end and the "cut" line, never the whole 7 MB', () => {
  const dir = scratch({
    'package.json': JSON.stringify({ scripts: { 'lint:test': 'node big.js' } }),
    // ~7 MB: past the cap, and past the 2 MB the old runCommand kept (it dropped the START).
    'big.js': [
      "const row = 'x'.repeat(99) + '\\n';",
      "process.stdout.write('FIRST-LINE\\n');",
      'for (let i = 0; i < 70000; i += 1) process.stdout.write(row);',
      "process.stdout.write('# tests 1\\nLAST-LINE\\n');",
      'process.exitCode = 1;',
      '',
    ].join('\n'),
  });
  try {
    const r = verify(dir, ['--only', 'linter-tests']);
    assert.equal(r.status, 1, r.out.slice(0, 500));
    const log = fs.readFileSync(logFile(dir, 'linter-tests'), 'utf8');
    const startAt = log.search(/FIRST-LINE\r?\n/);
    assert.ok(startAt >= 0 && startAt < 300, "the start is kept (after npm's banner)");
    assert.match(log, /LAST-LINE\s*$/, 'the end is kept');
    assert.match(log, /cut [\d]+ characters/, 'the cut line says how much');
    assert.ok(log.length <= OUTPUT_CAP_CHARS + 500, `${log.length} characters`);
    assert.ok(log.length > OUTPUT_CAP_CHARS - 500, 'the cap is used, not a smaller slice');
    assert.ok(r.out.length < 10_000, 'the console still shows only the tail');
  } finally {
    clean(dir);
  }
});

test('runCommand keeps the start of a long output too (it used to keep only the last megabyte past 2 MB)', async () => {
  const r = await runCommand(
    `${NODE} -e "process.stdout.write('START\\n'); for (let i = 0; i < 30000; i += 1) process.stdout.write('y'.repeat(99) + '\\n'); process.stdout.write('END\\n')"`,
    { cwd: os.tmpdir(), timeoutMs: 60_000 },
  );
  assert.equal(r.code, 0);
  assert.ok(r.output.startsWith('START\n'));
  assert.ok(r.output.endsWith('END\n'));
  assert.equal(
    r.output.length,
    'START\n'.length + 30000 * 100 + 'END\n'.length,
    'about 3 MB, all kept',
  );
});

// ---- the log files themselves ---------------------------------------------------------------------------------

test('logsDir is .verify/logs under the root; resetLogs creates it, or empties it (files and folders) and never touches its neighbours', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gabay-logs-'));
  try {
    assert.equal(logsDir(root), path.join(root, '.verify', 'logs'));
    assert.deepEqual(resetLogs(root), {});
    assert.deepEqual(fs.readdirSync(logsDir(root)), []);
    fs.writeFileSync(path.join(logsDir(root), 'a.log'), 'a');
    fs.mkdirSync(path.join(logsDir(root), 'sub'));
    fs.writeFileSync(path.join(logsDir(root), 'sub', 'b.log'), 'b');
    fs.writeFileSync(path.join(root, '.verify', 'last-run.json'), '{}');
    assert.deepEqual(resetLogs(root), {});
    assert.deepEqual(fs.readdirSync(logsDir(root)), []);
    assert.ok(fs.existsSync(path.join(root, '.verify', 'last-run.json')), 'the run record stays');
  } finally {
    clean(root);
  }
});

test('writeLog saves the text, reports the repo-relative path and line count; a failure is returned, not thrown', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gabay-logs-'));
  try {
    const saved = writeLog(root, 'eslint', 'one\ntwo\nthree\n');
    assert.equal(saved.file, '.verify/logs/eslint.log');
    assert.equal(saved.lines, 3);
    assert.equal(fs.readFileSync(path.join(root, saved.file), 'utf8'), 'one\ntwo\nthree\n');
    // .verify exists as a FILE: nothing can be created under it.
    const blocked = fs.mkdtempSync(path.join(os.tmpdir(), 'gabay-logs-'));
    fs.writeFileSync(path.join(blocked, '.verify'), 'a file, not a folder');
    const failed = writeLog(blocked, 'eslint', 'text');
    assert.equal(failed.file, undefined);
    assert.equal(typeof failed.error, 'string');
    assert.equal(
      typeof resetLogs(blocked).error,
      'string',
      'resetLogs reports instead of throwing',
    );
    clean(blocked);
  } finally {
    clean(root);
  }
});

// Passes either way (.verify/ was already git-ignored): the logs never enter the code fingerprint, which would
// make a red run read as "code changed during the run".
test('the logs are outside the fingerprint', () => {
  const dir = scratch({ 'tools/lint/run.js': "console.log('ok   repo-layout');\n" });
  try {
    const { fingerprint, codeFiles } = require(path.join(dir, 'tools', 'fingerprint.js'));
    const before = fingerprint(dir);
    fs.mkdirSync(path.join(dir, '.verify', 'logs'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.verify', 'logs', 'eslint.log'), 'x');
    assert.equal(fingerprint(dir), before);
    assert.ok(!codeFiles(dir).some((f) => f.startsWith('.verify/')));
  } finally {
    clean(dir);
  }
});
