// The logs of `npm run verify` (plan/PH1-verify-logs.md): a failing check's whole output is saved to
// .verify/logs/<check>.log, because the console shows only the last 30 lines and a failure that never comes back
// has to be read afterwards. The folder holds the latest run's failures only: verify empties it at the start of
// every run (after it has the verify lock), so a green run leaves it empty. .verify/ is git-ignored, so the logs
// never reach the repository or the code fingerprint.
//
// The size cap (OUTPUT_CAP_CHARS, tools/lib/proc.js) is applied ONCE, where a command's output is captured
// (runCommand's boundedOutput: start, "cut N characters" line, end). A log saves the text it is given as it is:
// cutting an already-cut text again would replace the true count with the size of the first cut line (review I1).
//
// Nothing here throws: a log that cannot be saved or removed must never turn a failing check into a crash of verify.
// Plain CommonJS, no dependencies, any Node >= 22.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * An old log may be held for a moment by an antivirus scan or an indexer (Windows: EBUSY or EPERM). fs.rmSync retries
 * those errors (EBUSY, EMFILE, ENFILE, ENOTEMPTY, EPERM; checked in Node 22.23's lib/internal/fs/rimraf.js) up to
 * maxRetries more times, waiting retryDelay, 2 x retryDelay, ... ms between tries: 5 retries of 100 ms wait 1.5 s
 * in all before a log counts as held.
 */
const REMOVE_RETRIES = 5;
const REMOVE_RETRY_DELAY_MS = 100;

/** The folder of the logs, under the repo root. */
const logsDir = (root) => path.join(root, '.verify', 'logs');

/**
 * Makes sure the logs folder exists and is empty (files and folders in it removed; nothing outside it touched).
 * Every entry is removed on its own, so one that is locked leaves only itself behind. Returns {} or { error }
 * (one line of text, naming each entry that could not be removed).
 */
function resetLogs(root) {
  const dir = logsDir(root);
  let entries;
  try {
    fs.mkdirSync(dir, { recursive: true });
    entries = fs.readdirSync(dir);
  } catch (err) {
    return { error: err.message };
  }
  const stuck = [];
  for (const entry of entries) {
    try {
      fs.rmSync(path.join(dir, entry), {
        recursive: true,
        force: true,
        maxRetries: REMOVE_RETRIES,
        retryDelay: REMOVE_RETRY_DELAY_MS,
      });
    } catch (err) {
      stuck.push(`${entry} (${err.code ?? err.message})`);
    }
  }
  return stuck.length ? { error: `still in use, left in place: ${stuck.join(', ')}` } : {};
}

/**
 * Saves a check's output as .verify/logs/<name>.log, as it is (see the header: the cap is applied where the
 * output is captured). Returns { file, lines } (file repo-relative with forward slashes) or { error } (text).
 */
function writeLog(root, name, text) {
  try {
    const dir = logsDir(root);
    fs.mkdirSync(dir, { recursive: true });
    const content = String(text);
    fs.writeFileSync(path.join(dir, `${name}.log`), content);
    const lines = content === '' ? 0 : content.replace(/\n$/, '').split('\n').length;
    return { file: `.verify/logs/${name}.log`, lines };
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { logsDir, resetLogs, writeLog };
