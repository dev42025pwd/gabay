// The verify lock fix (plan/PH1-verify-lock-fix.md, L143): under heavy load the lock went to two runs at once
// (api-coder's stress run, and one full verify that went red on tools/test/verify-lock-review.test.js S2a).
// Two causes, each with its tests here:
//   1. releaseLock swallowed a failed delete, leaving a lock the waiting runs then judged dead;
//   2. several runs judged the same dead lock; one cleared it and a new run took the lock; a run that had judged
//      earlier then renamed that LIVE lock aside (its link-back fails when a third run has created a lock).
//
// Written before the fix: the forced race, the one-clearer test, the stale-claim test and the release tests failed
// on 5a80228's lock (the forced race with only the test seam `afterJudge` added, a seam that changes nothing else).
// The short stress test passes on the old code most of the time (the race needs load), so it guards, it does not prove.
'use strict';

const test = require('./timeout');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { sleep, deadPid, holderRecord, clean } = require('./verify-scratch');
const { acquireLock, releaseLock } = require('../lib/verify-lock');

const claimOf = (file) => `${file}.clearing`;
const tempFolder = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gabay-lockfix-'));

/** Options for a run of acquireLock inside this process (every run here has this process's pid, which is alive). */
const run = (file, extra = {}) => ({
  file,
  root: path.dirname(file),
  waitMs: 20_000,
  pollMs: 20,
  log: () => {},
  ...extra,
});

// ---- 2. one clearer at a time ----------------------------------------------------------------------------------

test('the clearing race, forced: a run that judged a dead lock earlier never removes the live lock another run took since', async () => {
  const folder = tempFolder();
  const file = path.join(folder, 'race.lock');
  const realFs = { renameSync: fs.renameSync, unlinkSync: fs.unlinkSync, rmSync: fs.rmSync };
  try {
    fs.writeFileSync(file, JSON.stringify(holderRecord(await deadPid())));
    let judged;
    const hasJudged = new Promise((resolve) => (judged = resolve));
    let resume;
    const gate = new Promise((resolve) => (resume = resolve));
    // Run A judges the dead lock and is held still, between "judge" and "remove".
    const a = acquireLock(
      run(file, {
        owner: 'A',
        afterJudge: async () => {
          judged();
          await gate;
        },
      }),
    );
    await hasJudged;
    // Run B clears the dead lock and takes the lock: a live lock (this process's pid) is now in the file.
    const b = await acquireLock(run(file, { owner: 'B' }));
    assert.ok(b.handle, 'B holds the lock');
    const liveText = fs.readFileSync(file, 'utf8');

    // From here until A has had time to act, nobody may move or delete the live lock (B does not release yet).
    const touched = [];
    for (const name of Object.keys(realFs)) {
      fs[name] = (...args) => {
        const aimedAtLock = path.resolve(String(args[0])) === path.resolve(file);
        if (aimedAtLock && fs.readFileSync(file, 'utf8') === liveText) touched.push(name);
        return realFs[name](...args);
      };
    }
    resume();
    await sleep(300); // A runs on at once (a microtask); this is only room for whatever it does
    Object.assign(fs, realFs);
    assert.deepEqual(touched, [], 'A moved or deleted a lock whose holder is alive');
    assert.equal(fs.readFileSync(file, 'utf8'), liveText, 'B still holds the lock');

    releaseLock(b.handle, () => {});
    const got = await a; // B is done: now A gets it
    assert.ok(got.handle, 'A takes the lock once B has released it');
    releaseLock(got.handle, () => {});
    assert.equal(fs.existsSync(file), false);
    assert.equal(fs.existsSync(claimOf(file)), false, 'no claim left behind');
  } finally {
    Object.assign(fs, realFs);
    clean(folder);
  }
});

test('only one clearer: while another run holds the claim, a run neither removes the lock nor the claim, and keeps waiting', async () => {
  const folder = tempFolder();
  const file = path.join(folder, 'one.lock');
  try {
    const dead = JSON.stringify(holderRecord(await deadPid()));
    fs.writeFileSync(file, dead);
    const claim = JSON.stringify({ token: 'another-run', pid: process.pid });
    fs.writeFileSync(claimOf(file), claim);
    const lines = [];
    const got = await acquireLock(run(file, { waitMs: 600, log: (l) => lines.push(l) }));
    assert.equal(got.timedOut, true, 'it kept waiting, to the limit');
    assert.equal(fs.readFileSync(file, 'utf8'), dead, 'the dead lock is still there');
    assert.equal(
      fs.readFileSync(claimOf(file), 'utf8'),
      claim,
      "the other run's claim is untouched",
    );
    assert.ok(!lines.some((l) => /cleared|stale/.test(l)), lines.join('\n'));
  } finally {
    clean(folder);
  }
});

test('a clearing claim older than the limit (its run gone) is removed with one line, and the dead lock is cleared', async () => {
  const folder = tempFolder();
  const file = path.join(folder, 'old-claim.lock');
  try {
    fs.writeFileSync(file, JSON.stringify(holderRecord(await deadPid())));
    fs.writeFileSync(claimOf(file), JSON.stringify({ token: 'crashed-run', pid: await deadPid() }));
    const old = new Date(Date.now() - 120_000);
    fs.utimesSync(claimOf(file), old, old);
    const lines = [];
    const got = await acquireLock(run(file, { log: (l) => lines.push(l) }));
    assert.ok(got.handle, 'the run takes the lock');
    assert.equal(
      lines.filter((l) => /removed a stale clearing claim/.test(l)).length,
      1,
      lines.join('\n'),
    );
    assert.ok(
      lines.some((l) => /cleared a stale lock/.test(l)),
      lines.join('\n'),
    );
    assert.equal(fs.existsSync(claimOf(file)), false, 'its own claim is gone too');
    releaseLock(got.handle, () => {});
  } finally {
    clean(folder);
  }
});

// Review N1 (plan 1.1): the age alone broke a claim whose run was only PAUSED (a sleep, a debugger, a clock jump)
// between its re-read and its delete; the waiter then cleared the lock and took it, and the paused run deleted
// that new live lock. A claim is stale when its run is gone; a live run's claim only after a much longer age.
test('a claim whose run is alive but paused past the stale age is not broken: the waiter waits, and the two never hold the lock together', async () => {
  const folder = tempFolder();
  const file = path.join(folder, 'paused.lock');
  try {
    fs.writeFileSync(file, JSON.stringify(holderRecord(await deadPid())));
    const events = [];
    let holding = 0;
    let most = 0;
    const entered = (who) => (got) => {
      holding += 1;
      most = Math.max(most, holding);
      events.push(`in ${who}`);
      return got;
    };
    const leave = (who, got) => {
      holding -= 1;
      events.push(`out ${who}`);
      releaseLock(got.handle, () => {});
    };
    let reread;
    const hasReread = new Promise((resolve) => (reread = resolve));
    let resume;
    const gate = new Promise((resolve) => (resume = resolve));
    // X takes the claim, re-reads the dead lock and is held still, just before its delete. "30 s" is 150 ms here.
    const x = acquireLock(
      run(file, {
        owner: 'X',
        claimStaleMs: 150,
        afterReread: async () => {
          reread();
          await gate;
        },
      }),
    ).then(entered('X'));
    await hasReread;
    await sleep(400); // X's claim is now older than the stale age, and its run (this process) is alive
    const lines = [];
    const w = acquireLock(
      run(file, { owner: 'W', claimStaleMs: 150, log: (l) => lines.push(l) }),
    ).then(entered('W'));
    await sleep(400); // W polls every 20 ms: plenty of chances to break the claim
    assert.ok(fs.existsSync(claimOf(file)), "X's claim is still there");
    assert.ok(!lines.some((l) => /stale clearing claim/.test(l)), lines.join('\n'));
    assert.deepEqual(events, [], 'nobody holds the lock while X is paused');
    resume();
    leave('X', await x);
    leave('W', await w);
    assert.deepEqual(events, ['in X', 'out X', 'in W', 'out W']);
    assert.equal(most, 1, 'never two holders');
  } finally {
    clean(folder);
  }
});

test('a claim whose run is alive is broken after the much longer age (a hung run), with its line', async () => {
  const folder = tempFolder();
  const file = path.join(folder, 'hung.lock');
  try {
    fs.writeFileSync(file, JSON.stringify(holderRecord(await deadPid())));
    fs.writeFileSync(claimOf(file), JSON.stringify({ token: 'hung-run', pid: process.pid }));
    const old = new Date(Date.now() - 11 * 60_000);
    fs.utimesSync(claimOf(file), old, old);
    const lines = [];
    const got = await acquireLock(run(file, { log: (l) => lines.push(l) }));
    assert.ok(got.handle, 'the run takes the lock');
    const broken = lines.filter((l) => /removed a stale clearing claim/.test(l));
    assert.equal(broken.length, 1, lines.join('\n'));
    assert.match(broken[0], /still running|alive/);
    releaseLock(got.handle, () => {});
  } finally {
    clean(folder);
  }
});

test('a fresh claim (a clear in progress) is not stale: it is left alone', async () => {
  const folder = tempFolder();
  const file = path.join(folder, 'fresh-claim.lock');
  try {
    fs.writeFileSync(file, JSON.stringify(holderRecord(await deadPid())));
    fs.writeFileSync(claimOf(file), JSON.stringify({ token: 'busy-run', pid: process.pid }));
    const lines = [];
    await acquireLock(run(file, { waitMs: 300, log: (l) => lines.push(l) }));
    assert.ok(fs.existsSync(claimOf(file)));
    assert.ok(!lines.some((l) => /stale clearing claim/.test(l)), lines.join('\n'));
  } finally {
    clean(folder);
  }
});

test('a run clears a dead lock under the claim and leaves no claim, stale or temp file behind', async () => {
  const folder = tempFolder();
  const file = path.join(folder, 'clean.lock');
  try {
    fs.writeFileSync(file, JSON.stringify(holderRecord(await deadPid())));
    const got = await acquireLock(run(file));
    assert.ok(got.handle);
    assert.deepEqual(fs.readdirSync(folder), ['clean.lock']);
    releaseLock(got.handle, () => {});
    assert.deepEqual(fs.readdirSync(folder), []);
  } finally {
    clean(folder);
  }
});

// ---- 1. release retries ----------------------------------------------------------------------------------------

/**
 * Test cleanup only (the owner's ruling L155): deletes a scratch folder whose file a PowerShell helper held open. The
 * helper's exit and the OS letting go of the handle are not the same instant under a full verify's load, so a delete
 * that meets EBUSY or EPERM is retried briefly (bounded) instead of failing the test after a fixed sleep.
 */
async function cleanWhenFree(folder, withinMs = 5_000) {
  const until = Date.now() + withinMs;
  for (;;) {
    try {
      clean(folder);
      return;
    } catch (err) {
      if (!['EBUSY', 'EPERM'].includes(err.code) || Date.now() >= until) throw err;
      await sleep(50);
    }
  }
}

/**
 * Holds `file` open so that it cannot be deleted, for `holdMs` (Windows, PowerShell: Node's own handles always
 * share delete). `share` is 'Read' (the lock can still be read) or 'None' (it cannot even be read).
 */
async function holdOpen(file, share, holdMs) {
  const quoted = file.replace(/'/g, "''");
  const ps = spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$f = [IO.File]::Open('${quoted}', 'Open', 'Read', '${share}'); Write-Output held; Start-Sleep -Milliseconds ${holdMs}; $f.Close()`,
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const exited = new Promise((resolve) => ps.once('exit', resolve));
  await new Promise((resolve, reject) => {
    ps.stdout.on('data', (d) => String(d).includes('held') && resolve());
    ps.on('exit', () => reject(new Error('powershell ended before it held the file')));
  });
  return async () => {
    ps.kill();
    await exited;
  };
}

for (const share of ['Read', 'None']) {
  test(`release: a lock held open for a moment (${share} sharing) is removed after a short retry, in silence`, async (t) => {
    if (process.platform !== 'win32') {
      t.skip('POSIX deletes a file that is open; only Windows refuses (PowerShell holds it)');
      return;
    }
    const folder = tempFolder();
    const file = path.join(folder, 'brief.lock');
    let stop;
    try {
      const got = await acquireLock(run(file));
      stop = await holdOpen(file, share, 300);
      const lines = [];
      releaseLock(got.handle, (l) => lines.push(l));
      assert.equal(fs.existsSync(file), false, 'the lock is gone');
      assert.deepEqual(lines, [], 'nothing to say');
    } finally {
      await stop?.();
      await cleanWhenFree(folder);
    }
  });
}

test('release: a lock held open throughout stays, and one line names the file', async (t) => {
  if (process.platform !== 'win32') {
    t.skip('POSIX deletes a file that is open; only Windows refuses (PowerShell holds it)');
    return;
  }
  const folder = tempFolder();
  const file = path.join(folder, 'stuck.lock');
  let stop;
  try {
    const got = await acquireLock(run(file));
    stop = await holdOpen(file, 'Read', 30_000);
    const lines = [];
    releaseLock(got.handle, (l) => lines.push(l));
    assert.equal(fs.existsSync(file), true, 'it could not be removed');
    assert.equal(lines.length, 1, lines.join('\n'));
    assert.ok(lines[0].includes(file), lines[0]);
    assert.match(lines[0], /could not remove its lock/);
  } finally {
    await stop?.();
    await cleanWhenFree(folder);
  }
});

test('release never removes a lock that is not its own, and says nothing about it', async () => {
  const folder = tempFolder();
  const file = path.join(folder, 'theirs.lock');
  try {
    const got = await acquireLock(run(file));
    const theirs = JSON.stringify(holderRecord(process.pid, { token: 'someone-else' }));
    fs.writeFileSync(file, theirs);
    const lines = [];
    releaseLock(got.handle, (l) => lines.push(l));
    assert.equal(fs.readFileSync(file, 'utf8'), theirs);
    assert.deepEqual(lines, []);
  } finally {
    clean(folder);
  }
});

// ---- the short stress test -------------------------------------------------------------------------------------

/** `workers` processes released together, each appending "in" and "out" lines to one log. */
async function sequenceRound({ workers = 8, holdMs = 60, deadStart }) {
  const folder = tempFolder();
  const file = path.join(folder, 'seq.lock');
  const sequence = path.join(folder, 'sequence.log');
  if (deadStart) fs.writeFileSync(file, JSON.stringify(holderRecord(await deadPid())));
  const startAt = Date.now() + 1500; // all node processes are up by then
  const kids = Array.from({ length: workers }, (_, id) =>
    spawn(
      process.execPath,
      [
        path.join(__dirname, 'lock-seq-worker.js'),
        require.resolve('../lib/verify-lock'),
        file,
        startAt,
        sequence,
        holdMs,
        id,
      ],
      { stdio: 'ignore' },
    ),
  );
  const codes = await Promise.all(kids.map((k) => new Promise((resolve) => k.on('exit', resolve))));
  const lines = fs.existsSync(sequence) ? fs.readFileSync(sequence, 'utf8').trim().split('\n') : [];
  const leftover = fs.readdirSync(folder).filter((n) => n !== 'sequence.log');
  clean(folder);
  return { codes, lines, leftover };
}

test('stress: runs released together take the lock one at a time (the log strictly alternates in/out of one run), with or without a dead lock at the start', async () => {
  const rounds = await Promise.all([
    sequenceRound({ deadStart: false }),
    sequenceRound({ deadStart: true }),
    sequenceRound({ deadStart: true }),
    sequenceRound({ deadStart: false }),
  ]);
  rounds.forEach((r, i) => {
    assert.deepEqual(r.codes, Array(8).fill(0), `round ${i}: every worker ended`);
    assert.equal(r.lines.length, 16, `round ${i}: eight runs in and out`);
    for (let k = 0; k < r.lines.length; k += 2) {
      const [inWord, inId] = r.lines[k].split(' ');
      assert.deepEqual(
        [inWord, ...r.lines[k + 1].split(' ')],
        ['in', 'out', inId],
        `round ${i}: two holders at once around line ${k}: ${r.lines.slice(k, k + 3).join(' | ')}`,
      );
    }
    assert.deepEqual(r.leftover, [], `round ${i}: no lock, claim or temp file left`);
  });
});
