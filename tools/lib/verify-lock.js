// The verify lock (plan/PH1-verify-lock.md): one `npm run verify` at a time on this machine. Every run uses the
// same emulator ports (and, before the working copies of plan/PH1-worktrees.md, the same database gabay_dev), so two
// runs at once fail with no fault in the code (recorded in phase-reports/phase-1/S7.md §6).
//
// One lock file for the whole machine, in the system temp folder (os.tmpdir(): the TEMP or TMP folder on Windows,
// TMPDIR or /tmp elsewhere, so two users with different temp folders do not share it). A run creates it with an
// exclusive create (a complete file is written to a temp name, then hard-linked into place: the link fails if the
// lock exists, and nobody ever sees half a file). The file says who holds it. A second run prints who, at once and
// then every minute, and waits (reading the lock, never writing, while it waits); after a limit it stops. A lock
// whose process is gone is cleared, by one run at a time: it first takes a claim file beside the lock
// (<lock>.clearing, created exclusively), reads the lock again, and removes it only if it is still the same dead
// lock (plan/PH1-verify-lock-fix.md: without the claim, a run that had judged earlier could remove the live lock
// another run took since). Only the holder (the one whose token is in the file) removes its own, with a short retry,
// and says so when it cannot.
//
// The lock record has a `version` (LOCK_VERSION). A lock with a HIGHER version was written by newer code (another
// working copy, Part 2): this code cannot judge whether its holder is alive, so it is always treated as held and
// never cleared; a record with no version is e9836a7's format, which is version 1.
//
// Settings, all read by tools/verify.js:
//   GABAY_VERIFY_OWNER          who to name in the lock (for example "api-coder"); default: the user and folder
//   GABAY_VERIFY_LOCK_WAIT_MS   how long a second run waits before it gives up (positive whole number, default 15 min)
//   TEST SEAMS (tools/test only): GABAY_VERIFY_LOCK_FILE points the lock somewhere else; GABAY_VERIFY_LOCK_REPORT_MS
//   shortens the one-minute "busy" reminder.
//
// Plain CommonJS, no dependencies, any Node >= 22.
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pidExists } = require('./proc');

/** The lock file's name in the system temp folder (shared by every working copy on this machine). */
const LOCK_FILE_NAME = 'gabay-verify.lock';
/** The format of the lock record this code writes and understands. */
const LOCK_VERSION = 1;
/** How long a second run waits for the lock before it gives up. */
const DEFAULT_WAIT_MS = 15 * 60_000;
/** How often a waiting run repeats who holds the lock. */
const DEFAULT_REPORT_MS = 60_000;
/** How often a waiting run looks at the lock again. */
const POLL_MS = 500;
/**
 * Releasing the lock: its read and its delete are retried this many times, waiting 20 ms, 40 ms, ... between tries
 * (about 1.1 s in all), because on Windows another process reading the file can make either fail for a moment.
 */
const RELEASE_RETRIES = 10;
const RELEASE_RETRY_DELAY_MS = 20;
/**
 * A clearing claim (see takeClaim) older than this belongs to a run that died while clearing: a clear takes
 * milliseconds, so 30 s is far past any live one, and short enough that a crashed clear blocks later runs briefly.
 */
const CLAIM_STALE_MS = 30_000;
/**
 * ...but only when the run that holds the claim is gone (its pid is in the claim). A run that is alive may merely be
 * paused between its re-read and its delete (a sleep, a debugger, a clock jump): breaking its claim would let another
 * run clear the lock and take it, and the paused run would then delete that live lock (review N1, plan 1.1). A claim
 * whose run is alive is broken only after this much longer age, for a run that is hung for good.
 */
const CLAIM_LIVE_STALE_MS = 10 * 60_000;

/** Where the lock lives: GABAY_VERIFY_LOCK_FILE (a test seam), else the temp folder. */
function lockFilePath(env = process.env) {
  return env.GABAY_VERIFY_LOCK_FILE || path.join(os.tmpdir(), LOCK_FILE_NAME);
}

/** The wait limit from the environment: the default when unset or empty; an error for anything but a positive whole number. */
function readWaitLimit(raw = process.env.GABAY_VERIFY_LOCK_WAIT_MS) {
  if (raw === undefined || raw === '') return DEFAULT_WAIT_MS;
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(
      `GABAY_VERIFY_LOCK_WAIT_MS must be a positive whole number of milliseconds, got "${raw}"`,
    );
  }
  return Number(raw);
}

/** The reminder interval: GABAY_VERIFY_LOCK_REPORT_MS (a test seam) when it is a positive whole number, else a minute. */
function readReportInterval(raw = process.env.GABAY_VERIFY_LOCK_REPORT_MS) {
  return /^[1-9]\d*$/.test(raw ?? '') ? Number(raw) : DEFAULT_REPORT_MS;
}

const userName = () => {
  try {
    return os.userInfo().username;
  } catch {
    return process.env.USERNAME || process.env.USER || 'unknown user';
  }
};

/** Who is running: GABAY_VERIFY_OWNER if set, otherwise the user and the folder. */
function ownerName(root, env = process.env) {
  return env.GABAY_VERIFY_OWNER?.trim() || `${userName()} in ${path.basename(root)}`;
}

/** The short commit of the working copy, or "no commit" when git cannot say. */
function currentCommit(root) {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'no commit';
  }
}

/** "api-coder (pid 12, C:\\work\\gabay, abc1234)": how a message names a holder. */
const holderText = (r) => `${r.owner} (pid ${r.pid}, ${r.folder}, ${r.commit})`;

const isRecord = (r) =>
  r !== null &&
  typeof r === 'object' &&
  typeof r.token === 'string' &&
  Number.isInteger(r.pid) &&
  typeof r.owner === 'string';

/** What a message calls a holder: its owner line, or "a newer verify" when the record is not in a format this code reads. */
const describeHolder = (r) =>
  isRecord(r) ? holderText(r) : `a newer verify (lock version ${r.version})`;

/** The line a waiting run prints for a lock it can read. */
const busyLine = (r) => `verify is busy: held by ${describeHolder(r)}${since(r)}`;
const since = (r) => (r.startedAt ? ` since ${r.startedAt}` : '');

/** The line for a lock file that names no holder: its content is not a verify lock, or it could not be read now. */
const busyUnknownLine = (file, notALock) =>
  `verify is busy: ${file} is held by a run that cannot be identified (${notALock ? 'its content is not a verify lock' : 'it cannot be read now'}, and it cannot be cleared now)`;

/** The text of a duration as a person says it: "15 min", "90 s", "1500 ms". */
function durationText(ms) {
  if (ms % 60_000 === 0) return `${ms / 60_000} min`;
  if (ms % 1000 === 0) return `${ms / 1000} s`;
  return `${ms} ms`;
}

/**
 * Reads the lock. One of:
 *   { missing: true }              there is none
 *   { text, record }               a lock this code understands (version 1, or no version: the first format)
 *   { text, record, newer: true }  a lock written by newer code (version above ours): held, never judged or cleared
 *   { text, unreadable: true }     content that is not a lock at all
 *   { error }                      could not be read now (another process has it open)
 */
function readLock(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return err.code === 'ENOENT' ? { missing: true } : { error: err.message };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { unreadable: true, text };
  }
  if (parsed !== null && typeof parsed === 'object' && Number(parsed.version) > LOCK_VERSION) {
    return { text, record: parsed, newer: true };
  }
  return isRecord(parsed) ? { text, record: parsed } : { unreadable: true, text };
}

/** Creates the lock if it does not exist: true when this call created it. The file appears complete or not at all. */
function createExclusive(file, record) {
  const temp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(temp, `${JSON.stringify(record, null, 2)}\n`);
  try {
    fs.linkSync(temp, file);
    return true;
  } catch (err) {
    if (err.code === 'EEXIST') return false;
    throw err;
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

/** The claim file beside the lock: whoever holds it is the only run that may clear a dead lock. */
const claimPath = (file) => `${file}.clearing`;

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Takes the claim to clear a dead lock (plan/PH1-verify-lock-fix.md): created exclusively (a complete file hard-linked
 * into place, as the lock is), so only one run holds it. A claim whose run is gone (its pid is in the claim) and that
 * is older than CLAIM_STALE_MS, or whose run is alive and older than CLAIM_LIVE_STALE_MS, is removed with one line (rename to a name only this run uses, compare, delete; a claim that
 * turns out to be a fresh one of another run is linked back), and the caller tries again at once.
 * Returns { held: true }, { held: false } (another run is clearing: wait and judge afresh), { removedStale: true }
 * or { error } (the claim cannot be created: a folder this run cannot write).
 */
function takeClaim(
  file,
  token,
  log,
  { staleMs = CLAIM_STALE_MS, liveStaleMs = CLAIM_LIVE_STALE_MS } = {},
) {
  const claim = claimPath(file);
  try {
    const record = { token, pid: process.pid, startedAt: new Date().toISOString() };
    if (createExclusive(claim, record)) return { held: true };
  } catch (err) {
    return { error: err };
  }
  let text;
  let ageMs;
  try {
    text = fs.readFileSync(claim, 'utf8');
    ageMs = Date.now() - fs.statSync(claim).mtimeMs;
  } catch {
    return { held: false }; // gone, or in use this instant: look again next time
  }
  let holderPid;
  try {
    holderPid = JSON.parse(text).pid;
  } catch {
    // not a claim record: nobody can be waited for, so it counts as a run that is gone
  }
  const holderGone = !Number.isInteger(holderPid) || !pidExists(holderPid);
  if (ageMs < (holderGone ? staleMs : liveStaleMs)) return { held: false };
  const moved = `${claim}.old.${process.pid}.${crypto.randomBytes(4).toString('hex')}`;
  try {
    fs.renameSync(claim, moved);
  } catch {
    return { held: false };
  }
  let movedText = null;
  try {
    movedText = fs.readFileSync(moved, 'utf8');
  } catch {
    // unreadable now: treated as "not the claim that was judged"
  }
  // N2 (reviewer): if the rename moved a FRESH claim of another run (it was created between the judgement and the
  // rename) and a third run has created a claim since, the link-back below fails and two runs hold a claim. That needs
  // a claim left by a dead run (rare), several runs judging it in the same milliseconds, and two more arriving in the
  // microseconds around the rename. Even then each holder re-reads and judges the lock before removing it, so the
  // harm is one more clearer, not a live lock removed unless a third run takes the lock in the same instants. Left as
  // it is (closing it needs a claim on the claim); a stale claim is rare and this path rarer.
  if (movedText !== text) {
    try {
      fs.linkSync(moved, claim); // a fresh claim of another run: put it back
    } catch {
      // that run's claim is lost; the lock is still re-judged under any claim, so only its exclusivity is
    }
    fs.rmSync(moved, { force: true });
    return { held: false };
  }
  fs.rmSync(moved, { force: true });
  const why = holderGone
    ? 'the run that held it is gone'
    : `the run that held it is still running but has not finished in ${CLAIM_LIVE_STALE_MS / 60_000} min`;
  log(`verify: removed a stale clearing claim (${Math.round(ageMs / 1000)} s old): ${why}`);
  return { removedStale: true };
}

/** Gives the claim back (only a claim with this run's token). Never throws: a leftover goes stale on its own. */
function releaseClaim(file, token) {
  const claim = claimPath(file);
  try {
    if (JSON.parse(fs.readFileSync(claim, 'utf8')).token === token) fs.unlinkSync(claim);
  } catch {
    // gone already, or unreadable: CLAIM_STALE_MS takes care of it
  }
}

/** True when a lock as read is one to clear: not a lock at all (VL-5), or held by a process that is gone. */
const isDead = (read) =>
  Boolean(read.unreadable || (read.record && !read.newer && !pidExists(read.record.pid)));

/**
 * Clears a dead lock, holding the claim. The lock is READ AGAIN and judged again: only if it is still the very lock
 * this run judged, and still dead, is it removed; a lock another run took since is never touched (the old
 * rename-compare-link-back could remove it for an instant, and lose it when a third run created one in that instant).
 * Returns { cleared: true }, { changed: true } (it was not the lock judged; nothing was removed) or { error }.
 */
async function clearUnderClaim(file, judgedText, afterReread) {
  const again = readLock(file);
  if (again.missing || again.error || again.text !== judgedText || !isDead(again)) {
    return { changed: true };
  }
  await afterReread?.();
  try {
    fs.unlinkSync(file);
  } catch (err) {
    return err.code === 'ENOENT' ? { changed: true } : { error: err };
  }
  return { cleared: true };
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Takes the lock, waiting for it up to `waitMs`. Resolves { handle } when held (pass it to releaseLock), or
 * { timedOut: true, holder, message } when the limit passed. `log` prints the "busy" and "cleared" lines. A run
 * that waits only READS the lock until it is gone (no temp file at every poll).
 * `afterJudge` is a TEST SEAM: an async function called once a run has judged a lock dead and before it acts on it,
 * so a test can hold that run still while others act (the forced race in tools/test/verify-lock-fix.test.js).
 * `afterReread` is the same for a run that holds the claim: called after its second read, before its delete (a paused
 * run). `claimStaleMs` and `claimLiveStaleMs` replace CLAIM_STALE_MS and CLAIM_LIVE_STALE_MS, so a test need not wait
 * 30 s. None of the four is used outside tools/test.
 * @param {{ file: string, root: string, waitMs: number, reportMs?: number, pollMs?: number, owner?: string, log?: (line: string) => void, afterJudge?: (judgedText: string) => Promise<void>, afterReread?: () => Promise<void>, claimStaleMs?: number, claimLiveStaleMs?: number }} options
 */
async function acquireLock({
  file,
  root,
  waitMs,
  reportMs = DEFAULT_REPORT_MS,
  pollMs = POLL_MS,
  owner = ownerName(root),
  log = console.log,
  afterJudge,
  afterReread,
  claimStaleMs,
  claimLiveStaleMs,
}) {
  const record = {
    version: LOCK_VERSION,
    token: crypto.randomUUID(),
    owner,
    pid: process.pid,
    folder: root,
    commit: currentCommit(root),
    startedAt: new Date().toISOString(),
  };
  const waitStarted = Date.now();
  let reported = { key: null, at: 0 };
  let cannotClear = null; // the text of the stale lock whose removal failed: its line is printed once
  let holder = null;
  let notALock; // the lock file's content is not a verify lock (as opposed to a read error)
  for (;;) {
    const current = readLock(file);
    if (current.missing) {
      if (createExclusive(file, record)) return { handle: { file, token: record.token } };
      continue; // someone created it first: read it next
    }
    holder = current.record ?? holder;

    const dead = current.record && !current.newer && !pidExists(current.record.pid);
    if (current.unreadable || dead) {
      const what = dead
        ? `a stale lock held by ${holderText(current.record)}: that process no longer exists`
        : 'a stale lock (unreadable): its content is not a verify lock';
      await afterJudge?.(current.text);
      const claim = takeClaim(file, record.token, log, {
        staleMs: claimStaleMs,
        liveStaleMs: claimLiveStaleMs,
      });
      if (claim.removedStale) continue; // a dead run's claim is gone: try for it again
      // Without the claim another run is clearing: wait, and judge afresh next time (never on what was read now).
      let result = claim.held ? undefined : { error: claim.error };
      if (claim.held) {
        try {
          result = await clearUnderClaim(file, current.text, afterReread);
        } finally {
          releaseClaim(file, record.token);
        }
      }
      if (result?.cleared) {
        log(`verify: cleared ${what}`);
        continue;
      }
      if (result?.changed) continue; // it changed under us: read it again
      // Could not be removed (held open, or a folder this run cannot write): wait as for a live lock, below.
      if (result?.error && cannotClear !== current.text) {
        cannotClear = current.text;
        const why = result.error.code ?? result.error.message;
        log(`verify: could not clear ${what} (${why}); waiting for it as for a live lock`);
      }
    }

    notALock = Boolean(current.unreadable);
    const key = current.text ?? current.error;
    if (reported.key !== key || Date.now() - reported.at >= reportMs) {
      log(current.record ? busyLine(current.record) : busyUnknownLine(file, current.unreadable));
      reported = { key, at: Date.now() };
    }
    if (Date.now() - waitStarted >= waitMs) {
      const who = holder
        ? `${describeHolder(holder)}${since(holder)}`
        : `a run that cannot be identified (${file} ${notALock ? 'is not a verify lock' : 'could not be read'})`;
      const stuck = Number.isInteger(holder?.pid)
        ? `If that run is stuck, first check that process ${holder.pid} is a node process running verify (the number may belong to another program by now), then end it; or delete ${file}.`
        : `If that run is stuck, delete ${file}.`;
      return {
        timedOut: true,
        holder,
        message: `verify gave up waiting after ${durationText(waitMs)}: still held by ${who}. ${stuck}`,
      };
    }
    await pause(pollMs);
  }
}

/**
 * Removes the lock if this handle's run still holds it. Safe to call twice, or when it was never taken. On Windows
 * another process that has the file open (a waiting run reading it, an antivirus scan) can make the read or the delete
 * fail for a moment, so both are retried (RELEASE_RETRIES, RELEASE_RETRY_DELAY_MS); a lock that is still there
 * afterwards is said so in one line naming the file (never silent: a leftover lock is judged dead by the next runs).
 * A lock that is not this run's is never removed.
 */
function releaseLock(handle, log = console.log) {
  if (!handle) return;
  const stays = () =>
    log(
      `verify: could not remove its lock ${handle.file}; it stays until this process has ended, then the next run clears it`,
    );
  let current = readLock(handle.file);
  for (let attempt = 1; current.error && attempt <= RELEASE_RETRIES; attempt += 1) {
    sleepSync(attempt * RELEASE_RETRY_DELAY_MS);
    current = readLock(handle.file);
  }
  if (current.error) return stays(); // cannot even read it: it may still be ours
  if (current.record?.token !== handle.token) return; // gone, or not ours (any more): never remove it
  for (let attempt = 1; ; attempt += 1) {
    try {
      fs.unlinkSync(handle.file);
      return;
    } catch (err) {
      if (err.code === 'ENOENT') return;
      if (attempt > RELEASE_RETRIES) return stays();
      sleepSync(attempt * RELEASE_RETRY_DELAY_MS);
    }
  }
}

module.exports = {
  LOCK_FILE_NAME,
  LOCK_VERSION,
  DEFAULT_WAIT_MS,
  lockFilePath,
  readWaitLimit,
  readReportInterval,
  ownerName,
  acquireLock,
  releaseLock,
  busyLine,
};
