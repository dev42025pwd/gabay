// The verify lock (plan/PH1-verify-lock.md): one `npm run verify` at a time on this machine. Every run uses the
// same database (gabay_dev) and the same emulator ports, so two runs at once fail with no fault in the code
// (recorded in phase-reports/phase-1/S7.md §6).
//
// One lock file for the whole machine, in the system temp folder (os.tmpdir(): the TEMP or TMP folder on Windows,
// TMPDIR or /tmp elsewhere, so two users with different temp folders do not share it). A run creates it with an
// exclusive create (a complete file is written to a temp name, then hard-linked into place: the link fails if the
// lock exists, and nobody ever sees half a file). The file says who holds it. A second run prints who, at once and
// then every minute, and waits (reading the lock, never writing, while it waits); after a limit it stops. A lock
// whose process is gone is cleared. Only the holder (the one whose token is in the file) removes its own.
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

/**
 * Clears a lock this run has judged stale, without removing a lock another run took meanwhile (S2a: "read, confirm
 * dead, delete" lets run B delete the live lock that run C created after C removed the dead one). The file is
 * first RENAMED to a name only this run uses (a rename moves exactly one file, atomically, and fails while another
 * process holds the file open); then what was moved is compared with what was judged. The same text: it was the
 * stale lock, and it is deleted. Another text: this run moved a live lock by mistake, and links it back at once (if
 * even that fails because a third run created a lock in that instant, the live holder keeps running without its
 * file: a window of microseconds, with two runs starting at the very same moment).
 * Returns { cleared: true }, { changed: true } (it was not the lock judged; nothing was lost) or { error } (it could
 * not be moved: held open by another process, or in a folder this user cannot write).
 */
function clearStale(file, judgedText) {
  const claimed = `${file}.stale.${process.pid}.${crypto.randomBytes(4).toString('hex')}`;
  try {
    fs.renameSync(file, claimed);
  } catch (err) {
    return err.code === 'ENOENT' ? { changed: true } : { error: err };
  }
  let claimedText = null;
  try {
    claimedText = fs.readFileSync(claimed, 'utf8');
  } catch {
    // unreadable now: treated as "not the lock that was judged"
  }
  if (claimedText !== judgedText) {
    try {
      fs.linkSync(claimed, file);
    } catch {
      // see above: another run has the path already
    }
    fs.rmSync(claimed, { force: true });
    return { changed: true };
  }
  try {
    fs.unlinkSync(claimed);
  } catch {
    // the lock is out of the way, which is what matters; a leftover .stale file is harmless litter
  }
  return { cleared: true };
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Takes the lock, waiting for it up to `waitMs`. Resolves { handle } when held (pass it to releaseLock), or
 * { timedOut: true, holder, message } when the limit passed. `log` prints the "busy" and "cleared" lines. A run
 * that waits only READS the lock until it is gone (no temp file at every poll).
 * @param {{ file: string, root: string, waitMs: number, reportMs?: number, pollMs?: number, owner?: string, log?: (line: string) => void }} options
 */
async function acquireLock({
  file,
  root,
  waitMs,
  reportMs = DEFAULT_REPORT_MS,
  pollMs = POLL_MS,
  owner = ownerName(root),
  log = console.log,
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
      const result = clearStale(file, current.text);
      if (result.cleared) {
        log(`verify: cleared ${what}`);
        continue;
      }
      if (result.changed) continue; // it changed under us: read it again
      // Could not be moved (held open, or a folder this run cannot write): wait as for a live lock, below.
      if (cannotClear !== current.text) {
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

/** Removes the lock if this handle's run still holds it. Safe to call twice, or when it was never taken. */
function releaseLock(handle) {
  if (!handle) return;
  const current = readLock(handle.file);
  if (current.record?.token !== handle.token) return; // not ours (any more): never remove it
  try {
    fs.unlinkSync(handle.file);
  } catch {
    // gone already
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
