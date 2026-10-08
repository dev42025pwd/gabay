// The code fingerprint: one sha256 over the paths and contents of every code file in the repo.
// `npm run verify` stores it with its result; the Claude Stop hook recomputes it to learn whether
// the code changed since the last verify (L129). Both use this one module, so they cannot disagree.
//
// Code = app/, functions/, db/, tools/, .githooks/, .github/, .claude/hooks/, root package.json, firebase.json
// and .claude/settings.json; from `git ls-files --cached --others --exclude-standard`, so ignored
// output (build/, node_modules/, .dart_tool/, .verify/) never counts and an untracked new file does.
// Documents (*.md, docs/, plan.html, ...) are outside the set: a docs-only edit changes nothing.
//
// Plain CommonJS, no dependencies, any Node >= 22.
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const CODE_PREFIXES = [
  'app/',
  'functions/',
  'db/',
  'tools/',
  '.githooks/',
  '.claude/hooks/',
  '.github/',
];
const CODE_FILES = new Set([
  'package.json',
  'firebase.json',
  '.claude/settings.json',
  '.gitignore',
]);
/** Not code even when it sits under a code folder. */
const NOT_CODE = [/\.md$/i];

/** True when a repo-relative path (forward slashes) is part of the fingerprint. */
function isCode(rel) {
  if (NOT_CODE.some((re) => re.test(rel))) return false;
  return CODE_FILES.has(rel) || CODE_PREFIXES.some((p) => rel.startsWith(p));
}

/** The code files, sorted, as repo-relative paths. */
function codeFiles(root = ROOT) {
  const out = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return [...new Set(out.split('\0').filter(Boolean))].filter(isCode).sort();
}

/** sha256 hex of (path, content) for every code file. A file deleted from disk is skipped. */
function fingerprint(root = ROOT) {
  const hash = crypto.createHash('sha256');
  for (const rel of codeFiles(root)) {
    let content;
    try {
      content = fs.readFileSync(path.join(root, rel));
    } catch {
      continue; // tracked but deleted in the working tree
    }
    hash.update(`${rel}\0${content.length}\0`);
    hash.update(content);
  }
  return hash.digest('hex');
}

/** Where `npm run verify` records its last run (gitignored). */
const stateFile = (root = ROOT) => path.join(root, '.verify', 'last-run.json');

/**
 * The last verify run and how it was read: { state, corrupt, error }. A missing record is { state: null,
 * corrupt: false }; one that does not parse (an interrupted or interleaved write, an edit) is { state: null,
 * corrupt: true, error } so a caller can say "corrupt" instead of "not run".
 */
function readStateDetailed(root = ROOT) {
  let text;
  try {
    text = fs.readFileSync(stateFile(root), 'utf8');
  } catch {
    return { state: null, corrupt: false, error: null };
  }
  try {
    return { state: JSON.parse(text), corrupt: false, error: null };
  } catch (err) {
    return { state: null, corrupt: true, error: err.message };
  }
}

/** The last verify run, or null when there is none or it is unreadable. */
function readState(root = ROOT) {
  return readStateDetailed(root).state;
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Records a verify run. Written to a temp file in the same folder, then renamed over the record: the rename
 * is atomic, so a reader (the Stop hook) or a second verify finishing at the same moment never sees half a
 * file (two runs once interleaved their in-place writes and left a corrupt record). On Windows a rename can
 * fail for a moment while another process is replacing the file, so it is retried briefly.
 */
function writeState(state, root = ROOT) {
  const file = stateFile(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`);
  for (let attempt = 1; ; attempt += 1) {
    try {
      fs.renameSync(temp, file);
      return;
    } catch (err) {
      if (attempt >= 20 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) {
        fs.rmSync(temp, { force: true });
        throw err;
      }
      sleep(25 * attempt);
    }
  }
}

module.exports = {
  ROOT,
  isCode,
  codeFiles,
  fingerprint,
  stateFile,
  readState,
  readStateDetailed,
  writeState,
};
