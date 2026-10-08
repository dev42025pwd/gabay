// The logs of `npm run verify` (plan/PH1-verify-logs.md): a failing check's whole output is saved to
// .verify/logs/<check>.log, because the console shows only the last 30 lines and a failure that never comes back
// has to be read afterwards. The folder holds the latest run's failures only: verify empties it at the start of
// every run (after it has the verify lock), so a green run leaves it empty. .verify/ is git-ignored, so the logs
// never reach the repository or the code fingerprint. A log keeps at most OUTPUT_CAP_CHARS characters
// (tools/lib/proc.js): past that, its start and end with a line saying how much was cut.
//
// Nothing here throws: a log that cannot be saved must never turn a failing check into a crash of verify.
// Plain CommonJS, no dependencies, any Node >= 22.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { capText } = require('./proc');

/** The folder of the logs, under the repo root. */
const logsDir = (root) => path.join(root, '.verify', 'logs');

/**
 * Makes sure the logs folder exists and is empty (files and folders in it removed; nothing outside it touched).
 * Returns {} or { error } (text).
 */
function resetLogs(root) {
  const dir = logsDir(root);
  try {
    fs.mkdirSync(dir, { recursive: true });
    for (const entry of fs.readdirSync(dir)) {
      fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
    }
    return {};
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Saves a check's output as .verify/logs/<name>.log, cut to the cap if it is longer.
 * Returns { file, lines } (file repo-relative with forward slashes) or { error } (text).
 */
function writeLog(root, name, text) {
  try {
    const dir = logsDir(root);
    fs.mkdirSync(dir, { recursive: true });
    const content = capText(String(text));
    fs.writeFileSync(path.join(dir, `${name}.log`), content);
    const lines = content === '' ? 0 : content.replace(/\n$/, '').split('\n').length;
    return { file: `.verify/logs/${name}.log`, lines };
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { logsDir, resetLogs, writeLog };
