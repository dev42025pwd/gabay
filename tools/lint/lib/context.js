// What a linter is given: the repo root, the files it may look at, and a reader.
// A linter asks ctx.list(predicate) for its files; in --files mode (pre-commit) that is only the
// listed files, otherwise every file in the repo. Reports are { file, line, rule, message }.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SKIP_DIRS = new Set([
  'node_modules',
  'build',
  '.dart_tool',
  '.git',
  '.gradle',
  'Pods',
  '.emulator-data',
  '.firebase',
  'coverage',
]);

/** Generated code and the linters' own bad samples are never linted (plan S4). */
const SKIP_PATHS = [
  /^app\/lib\/l10n\/app_localizations[^/]*\.dart$/,
  /(^|\/)tools\/lint\/test\/fixtures\//,
];

const toPosix = (p) => p.split(path.sep).join('/');
const isSkipped = (rel) => SKIP_PATHS.some((re) => re.test(rel));

function walk(root, dir = '') {
  const out = [];
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...walk(root, rel));
    } else if (!isSkipped(rel)) {
      out.push(rel);
    }
  }
  return out;
}

/**
 * @param {object} o
 * @param {string} o.root  repo root (absolute)
 * @param {string[]|null} [o.files]  explicit repo-relative files (pre-commit); null = the whole repo
 * @param {boolean} [o.staged]  migrations-immutable: compare the index with HEAD
 * @param {string|null} [o.base]  migrations-immutable: compare <base>...HEAD (CI)
 */
function createContext({ root, files = null, staged = false, base = null }) {
  let all = null;
  const scanned = new Set(); // files this linter was handed or read, for the per-linter count
  const explicit = files
    ? files
        .map((f) => toPosix(path.isAbsolute(f) ? path.relative(root, f) : f).replace(/^\.\//, ''))
        .filter((f) => !isSkipped(f) && fs.existsSync(path.join(root, f)))
    : null;

  return {
    root,
    staged,
    base,
    /**
     * Repo-relative paths (forward slashes) that satisfy `test`.
     * `widenOn`: in --files mode, if any of these paths is in the list the linter looks at the whole
     * repo instead (a schema.sql change can break files that did not change).
     */
    list(test, { widenOn = [] } = {}) {
      const narrow = explicit && !widenOn.some((w) => explicit.includes(w));
      if (!narrow) all ??= walk(root);
      const found = (narrow ? explicit : all).filter(test);
      found.forEach((f) => scanned.add(f));
      return found;
    },
    /** Like list(), but always the whole repo (for checks that compare files with each other). */
    repo(test) {
      all ??= walk(root);
      const found = all.filter(test);
      found.forEach((f) => scanned.add(f));
      return found;
    },
    read(rel) {
      scanned.add(rel);
      return fs.readFileSync(path.join(root, rel), 'utf8');
    },
    /** Forget what was scanned; the runner calls this before each linter. */
    startCount: () => scanned.clear(),
    /** How many distinct files the current linter was handed or read. */
    scannedCount: () => scanned.size,
    exists: (rel) => fs.existsSync(path.join(root, rel)),
    /** True when the schema is among the files being checked, or there is no file list. */
    touches: (rel) => !explicit || explicit.includes(rel),
  };
}

const violation = (file, line, rule, message) => ({ file, line, rule, message });

module.exports = { createContext, violation, toPosix };
