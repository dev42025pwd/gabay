// The verify lock (plan/PH1-verify-lock.md): one `npm run verify` at a time on this machine. Every run uses the
// same database (gabay_dev) and the same emulator ports, so two runs at once fail with no fault in the code
// (recorded in phase-reports/phase-1/S7.md §6).
//
// One lock file for the whole machine, in the system temp folder. A run creates it with an exclusive create (a
// complete file is written to a temp name, then hard-linked into place: the link fails if the lock exists, and
// nobody ever sees half a file). The file says who holds it. A second run prints who, at once and then every
// minute, and waits; after a limit it stops. A lock whose process is gone is cleared. Only the holder (the one
// whose token is in the file) removes it.
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

/** The line a waiting run prints. */
const busyLine = (r) => `verify is busy: held by ${holderText(r)} since ${r.startedAt}`;

/** The text of a duration as a person says it: "15 min", "90 s", "1500 ms". */
function durationText(ms) {
  if (ms % 60_000 === 0) return `${ms / 60_000} min`;
  if (ms % 1000 === 0) return `${ms / 1000} s`;
  return `${ms} ms`;
}

const isRecord = (r) =>
  r !== null &&
  typeof r === 'object' &&
  typeof r.token === 'string' &&
  Number.isInteger(r.pid) &&
  typeof r.owner === 'string';

/**
 * Reads the lock: { text, record } for a readable lock, { missing: true } when there is none, { unreadable: true,
 * text } when its content is not a lock, { error } when it could not be read now (another process has it open).
 */
function readLock(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return err.code === 'ENOENT' ? { missing: true } : { error: err.message };
  }
  try {
    const record = JSON.parse(text);
    return isRecord(record) ? { text, record } : { unreadable: true, text };
  } catch {
    return { unreadable: true, text };
  }
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

/** Removes the lock only if it still holds `text` (so a lock another run took meanwhile is never removed). */
function removeIfUnchanged(file, text) {
  if (readLock(file).text !== text) return false;
  try {
    fs.unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Takes the lock, waiting for it up to `waitMs`. Resolves { handle } when held (pass it to releaseLock), or
 * { timedOut: true, holder, message } when the limit passed. `log` prints the "busy" and "cleared" lines.
 * @param {{ file: string, root: string, waitMs: number, reportMs?: number, owner?: string, log?: (line: string) => void }} options
 */
async function acquireLock({
  file,
  root,
  waitMs,
  reportMs = DEFAULT_REPORT_MS,
  owner = ownerName(root),
  log = console.log,
}) {
  const record = {
    token: crypto.randomUUID(),
    owner,
    pid: process.pid,
    folder: root,
    commit: currentCommit(root),
    startedAt: new Date().toISOString(),
  };
  const waitStarted = Date.now();
  let reported = { token: null, at: 0 };
  let holder = null;
  for (;;) {
    if (createExclusive(file, record)) return { handle: { file, token: record.token } };

    const current = readLock(file);
    if (current.missing) continue; // released between our create and our read: try again at once
    if (current.unreadable) {
      if (removeIfUnchanged(file, current.text)) {
        log('verify: cleared a stale lock (unreadable): its content is not a verify lock');
      }
      continue;
    }
    if (current.record) {
      holder = current.record;
      if (!pidExists(holder.pid)) {
        if (removeIfUnchanged(file, current.text)) {
          log(
            `verify: cleared a stale lock held by ${holderText(holder)}: that process no longer exists`,
          );
        }
        continue;
      }
      const now = Date.now();
      if (reported.token !== holder.token || now - reported.at >= reportMs) {
        log(busyLine(holder));
        reported = { token: holder.token, at: now };
      }
    }
    if (Date.now() - waitStarted >= waitMs) {
      const who = holder
        ? `${holderText(holder)} since ${holder.startedAt}`
        : `an unknown run (${file} could not be read)`;
      return {
        timedOut: true,
        holder,
        message:
          `verify gave up waiting after ${durationText(waitMs)}: still held by ${who}. ` +
          `Wait for it to finish; if that run is stuck, end it${holder ? ` (pid ${holder.pid})` : ''} or delete ${file}.`,
      };
    }
    await pause(POLL_MS);
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
  DEFAULT_WAIT_MS,
  lockFilePath,
  readWaitLimit,
  readReportInterval,
  ownerName,
  acquireLock,
  releaseLock,
  busyLine,
};
