// The verify lock, review fixes (plan/PH1-verify-lock.md 1.1; dod-reviewer's findings on e9836a7, L140). Each test
// names the bug it guards, and each failed on e9836a7 except the two simultaneous-start rounds (S2a), see below:
//   I1  a stale lock that cannot be removed made a waiting run spin: no pause, no limit check, no output, a temp
//       file per loop, and a run that never ended while the lock was held open;
//   S2a clearing a dead lock could remove the live lock another run had just taken (check, then delete);
//   S2b a closed terminal (SIGHUP) left the lock behind;
//   S2c a waiting run created (and removed) a temp file at every poll;
//   S2d a lock written by newer code (a "version" it does not know) was cleared as unreadable;
//   W3  the time-out message told the reader to end a pid that may now belong to another program.
// Both simultaneous-start rounds (S2a: nothing there at the start, and all eight clearing one dead lock) PASS on
// e9836a7's code too: its exclusive create already held, and the window the claim-by-rename closes is microseconds
// wide, so no test reproduces it. They are the plan's item 4 and a guard for the new clearing, not a regression test.
'use strict';

const test = require('./timeout');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  scratch,
  verify,
  startVerify,
  lockFileOf,
  sleep,
  waitUntil,
  liveHolder,
  deadPid,
  holderRecord,
  writeLock,
  readLock,
  lockExists,
  clean,
  cleanWhenFree,
  seenFile,
  noteLockCheck,
  sleepingCheck,
} = require('./verify-scratch');
const { STOP_SIGNALS } = require('../verify');
const lockModule = require('../lib/verify-lock');

/**
 * A lock file that no run can remove or rename. Windows: another process holds it open without delete sharing
 * (PowerShell, because Node's own handles always share delete). POSIX: it sits in a folder the user cannot write.
 * Returns { file, folder, release() }, or null when this machine cannot make one (POSIX as root).
 */
async function undeletableLock(content) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'gabay-lock-stuck-'));
  const file = path.join(folder, 'test.lock');
  fs.writeFileSync(file, content);
  if (process.platform === 'win32') {
    const quoted = file.replace(/'/g, "''");
    const ps = spawn(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$f = [IO.File]::Open('${quoted}', 'Open', 'Read', 'Read'); Write-Output held; Start-Sleep -Seconds 300`,
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const exited = new Promise((resolve) => ps.once('exit', resolve));
    await new Promise((resolve, reject) => {
      ps.stdout.on('data', (d) => String(d).includes('held') && resolve());
      ps.on('exit', () => reject(new Error('powershell ended before it held the file')));
    });
    // Awaiting the helper's real exit, not a fixed sleep (test cleanup only; the owner's ruling L155).
    return {
      file,
      folder,
      release: async () => {
        ps.kill();
        await exited;
      },
    };
  }
  if (process.getuid?.() === 0) return null; // root ignores folder permissions
  fs.chmodSync(folder, 0o555);
  return { file, folder, release: () => fs.chmodSync(folder, 0o755) };
}

for (const kind of ['dead process', 'unreadable content']) {
  test(`I1: a stale lock that cannot be removed (${kind}) is waited on like a live one: one line, the busy line, exit 2 at the limit, no spinning`, async (t) => {
    const stuck = await undeletableLock(
      kind === 'dead process' ? JSON.stringify(holderRecord(await deadPid())) : 'not json',
    );
    if (!stuck) {
      t.skip('running as root: folder permissions do not apply');
      return;
    }
    const dir = scratch();
    try {
      const started = Date.now();
      const r = verify(dir, ['--only', 'node-version'], {
        env: {
          GABAY_VERIFY_LOCK_FILE: stuck.file,
          GABAY_VERIFY_LOCK_WAIT_MS: '2000',
          GABAY_VERIFY_LOCK_REPORT_MS: '700',
        },
        timeout: 40_000, // e9836a7 never ended here
      });
      assert.equal(r.status, 2, `ended at the limit, not killed: ${r.out}${r.err}`);
      assert.ok(Date.now() - started < 30_000);
      assert.equal((r.out.match(/could not clear a stale lock/g) ?? []).length, 1, r.out);
      assert.match(r.out, /verify is busy: /, 'it waits as for a live lock');
      assert.ok((r.out.match(/verify is busy: /g) ?? []).length <= 6, 'no flood of lines');
      assert.match(r.err, /gave up waiting/);
      if (kind === 'unreadable content') {
        // The file was read; it is just not a lock (the message must not say it cannot be read).
        assert.match(r.err, /test.lock is not a verify lock/);
        assert.doesNotMatch(r.err, /cannot be read|could not be read/);
      }
      assert.equal(r.state, null);
      assert.deepEqual(fs.readdirSync(stuck.folder), ['test.lock'], 'no temp or claimed file left');
    } finally {
      await stuck.release();
      fs.chmodSync(stuck.folder, 0o755);
      await cleanWhenFree(stuck.folder);
      clean(dir);
    }
  });
}

test('S2c: a run waiting on a live lock reads it and writes no temp file at all while it waits', async () => {
  const dir = scratch();
  const file = lockFileOf(dir);
  fs.writeFileSync(file, JSON.stringify(holderRecord(process.pid)));
  const writes = [];
  const realWrite = fs.writeFileSync;
  fs.writeFileSync = (target, ...rest) => (writes.push(String(target)), realWrite(target, ...rest));
  try {
    const got = await lockModule.acquireLock({
      file,
      root: dir,
      waitMs: 1500,
      reportMs: 500,
      log: () => {},
    });
    assert.equal(got.timedOut, true);
  } finally {
    fs.writeFileSync = realWrite;
    clean(dir);
  }
  assert.deepEqual(writes, [], 'nothing was written while it waited');
});

test('S2d: a lock with a version this code does not know is held, never cleared: even by a dead pid', async () => {
  const dir = scratch();
  const wait = { GABAY_VERIFY_LOCK_WAIT_MS: '1500', GABAY_VERIFY_LOCK_REPORT_MS: '400' };
  try {
    const record = holderRecord(await deadPid(), { version: 99 });
    writeLock(dir, record);
    const r = verify(dir, ['--only', 'node-version'], { env: wait });
    assert.equal(r.status, 2, r.out + r.err);
    assert.doesNotMatch(r.out, /cleared a stale lock/);
    assert.match(r.out, /verify is busy: held by api-coder/);
    assert.deepEqual(readLock(dir), record, 'untouched');
    // A newer lock in a shape this code cannot read at all is held too.
    const odd = JSON.stringify({ version: 99, holder: 'someone', since: 'then' });
    fs.writeFileSync(lockFileOf(dir), odd);
    const r2 = verify(dir, ['--only', 'node-version'], { env: wait });
    assert.equal(r2.status, 2, r2.out + r2.err);
    assert.match(r2.out, /verify is busy: .*newer/);
    assert.equal(fs.readFileSync(lockFileOf(dir), 'utf8'), odd, 'untouched');
  } finally {
    clean(dir);
  }
});

test('S2d: the lock a run writes carries a version, and a lock without one (e9836a7) is the same format', async () => {
  const seen = seenFile('version');
  const dir = scratch(noteLockCheck(seen));
  try {
    const r = verify(dir, ['--only', 'linter-tests']);
    assert.equal(r.status, 0, r.out + r.err);
    assert.equal(JSON.parse(fs.readFileSync(seen, 'utf8')).version, 1);
    writeLock(dir, holderRecord(await deadPid())); // no version field
    const old = verify(dir, ['--only', 'node-version']);
    assert.match(old.out, /cleared a stale lock held by api-coder/);
    assert.equal(old.status, 0);
  } finally {
    clean(dir);
    fs.rmSync(seen, { force: true });
  }
});

test('W3: the time-out message does not tell the reader to end a pid blindly', () => {
  const dir = scratch();
  const holder = liveHolder();
  try {
    writeLock(dir, holderRecord(holder.pid));
    const r = verify(dir, ['--only', 'node-version'], {
      env: { GABAY_VERIFY_LOCK_WAIT_MS: '1000', GABAY_VERIFY_LOCK_REPORT_MS: '400' },
    });
    assert.equal(r.status, 2);
    assert.doesNotMatch(r.err, /end it \(pid/);
    assert.match(
      r.err,
      new RegExp(`check that process ${holder.pid} is a node process running verify`),
    );
    assert.match(r.err, /delete .*test-verify\.lock/);
  } finally {
    holder.kill();
    clean(dir);
  }
});

test('S2b: a closed terminal (SIGHUP) stops the run like Ctrl-C, so it releases the lock', () => {
  assert.deepEqual(STOP_SIGNALS, ['SIGINT', 'SIGTERM', 'SIGHUP']);
});

test('S2b: a real SIGHUP releases the lock', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Node on Windows cannot deliver SIGHUP to a handler (STOP_SIGNALS is checked above)');
    return;
  }
  const dir = scratch(sleepingCheck(20_000));
  try {
    const run = startVerify(dir, ['--only', 'linter-tests']);
    assert.ok(await waitUntil(() => lockExists(dir)));
    await sleep(500);
    run.child.kill('SIGHUP');
    const r = await run.done;
    assert.equal(r.status, 130, r.out + r.err);
    assert.equal(lockExists(dir), false);
  } finally {
    clean(dir);
  }
});

/**
 * A true simultaneous start: `workers` processes are released at the same moment (lock-worker.js); each takes the
 * lock, holds it `holdMs` and releases it. `deadStart`: the lock is there already, held by a dead process, so every
 * worker tries to clear it at once (S2a: one worker's check-then-delete could remove another's live lock).
 */
async function simultaneousRound({ workers = 8, holdMs = 120, deadStart }) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'gabay-lock-race-'));
  const file = path.join(folder, 'race.lock');
  const marker = path.join(folder, 'inside');
  const overlaps = path.join(folder, 'overlaps.log');
  const entered = path.join(folder, 'entered.log');
  if (deadStart) fs.writeFileSync(file, JSON.stringify(holderRecord(await deadPid())));
  const startAt = Date.now() + 1500; // all node processes are up by then
  const kids = Array.from({ length: workers }, (_, id) =>
    spawn(
      process.execPath,
      [
        path.join(__dirname, 'lock-worker.js'),
        require.resolve('../lib/verify-lock'),
        file,
        startAt,
        marker,
        overlaps,
        entered,
        holdMs,
        id,
      ],
      { stdio: 'ignore' },
    ),
  );
  const codes = await Promise.all(kids.map((k) => new Promise((resolve) => k.on('exit', resolve))));
  const result = {
    codes,
    overlaps: fs.existsSync(overlaps) ? fs.readFileSync(overlaps, 'utf8').trim().split('\n') : [],
    entered: fs.readFileSync(entered, 'utf8').trim().split('\n').length,
    leftover: fs.readdirSync(folder).filter((n) => /\.(lock|stale)/.test(n)),
  };
  clean(folder);
  return result;
}

for (const deadStart of [false, true]) {
  const what = deadStart ? 'all clearing one dead lock' : 'nothing there at the start';
  test(`S2a: eight runs released at the same moment never hold the lock together (${what})`, async () => {
    for (let round = 1; round <= 2; round += 1) {
      const r = await simultaneousRound({ deadStart });
      assert.deepEqual(r.codes, Array(8).fill(0), `round ${round}: every worker ended`);
      assert.deepEqual(r.overlaps, [], `round ${round}: two holders at once`);
      assert.equal(r.entered, 8, `round ${round}: each worker held the lock in turn`);
      assert.deepEqual(r.leftover, [], `round ${round}: no lock or claimed file left`);
    }
  });
}
