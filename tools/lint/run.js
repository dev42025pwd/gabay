#!/usr/bin/env node
// The structural linters (plan/PH1-rails.md S4; standard §7.2). Each one encodes a mistake this
// project must never ship; each names the file and line it fails on, as   path:line: rule: message
//
//   node tools/lint/run.js                      every linter over the whole repo
//   node tools/lint/run.js schema-forms ...     only the named linters
//   node tools/lint/run.js --files a.dart b.js  only these files (pre-commit); a changed db/schema.sql
//                                               widens schema-forms and tenant-predicate to the repo
//   node tools/lint/run.js --staged             migrations-immutable: the index against HEAD
//   node tools/lint/run.js --base origin/main   migrations-immutable: REF...HEAD (CI)
//   node tools/lint/run.js --root <dir>         lint another tree (the tests do)
//
// Exit code = the number of violations, at most 255.
'use strict';

const path = require('node:path');
const { createContext } = require('./lib/context');

const LINTERS = [
  require('./schema-drops'),
  require('./schema-forms'),
  require('./no-bare-textfield'),
  require('./colour-literals'),
  require('./sql-interpolation'),
  require('./tenant-predicate'),
  require('./position-privacy'),
  require('./foreground-manifest'),
  require('./migrations-immutable'),
  require('./no-snackbar'),
];

function parseArgs(argv) {
  const opts = { names: [], files: null, staged: false, base: null, root: path.resolve(__dirname, '..', '..') };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--files') {
      opts.files = [];
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) opts.files.push(argv[(i += 1)]);
    } else if (a === '--staged') opts.staged = true;
    else if (a === '--base') opts.base = argv[(i += 1)];
    else if (a === '--root') opts.root = path.resolve(argv[(i += 1)]);
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else opts.names.push(a);
  }
  const known = LINTERS.map((l) => l.name);
  const unknown = opts.names.filter((n) => !known.includes(n));
  if (unknown.length) throw new Error(`unknown linter ${unknown.join(', ')} (known: ${known.join(', ')})`);
  return opts;
}

/** Two literals on one line can report the same thing twice; say it once. */
const unique = (violations) => [
  ...new Map(violations.map((v) => [`${v.file}:${v.line}:${v.rule}:${v.message}`, v])).values(),
];

/** Runs the selected linters; returns { results: [{ name, violations }], count }. */
function runLinters(opts) {
  const ctx = createContext(opts);
  const selected = LINTERS.filter((l) => opts.names.length === 0 || opts.names.includes(l.name));
  const results = selected.map((linter) => {
    try {
      return { name: linter.name, violations: unique(linter.run(ctx)) };
    } catch (err) {
      // A linter that crashes must fail the run, never pass silently.
      return { name: linter.name, violations: [{ file: '(linter)', line: 0, rule: linter.name, message: `crashed: ${err.stack || err}` }] };
    }
  });
  return { results, count: results.reduce((n, r) => n + r.violations.length, 0) };
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const { results, count } = runLinters(opts);
  for (const { name, violations } of results) {
    for (const v of violations) console.log(`${v.file}:${v.line}: ${v.rule}: ${v.message}`);
    console.log(`${violations.length === 0 ? 'ok  ' : 'FAIL'} ${name}${violations.length ? ` (${violations.length})` : ''}`);
  }
  console.log(count === 0 ? `\n${results.length} linter(s), 0 violations.` : `\n${count} violation(s).`);
  process.exit(Math.min(count, 255));
}

if (require.main === module) main();

module.exports = { LINTERS, runLinters, parseArgs };
