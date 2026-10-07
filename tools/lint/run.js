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
//   node tools/lint/run.js --root <dir> --allow-partial   do not require db/schema.sql, app/lib, functions/src
//                                               (only valid together with --root)
//
// A whole-repo run (no --files) fails if db/schema.sql, app/lib or functions/src is missing: a
// linter with nothing to look at must never look like a pass. Each linter prints how many files it
// scanned. Exit code = the number of violations, at most 255; 2 for a bad argument.
'use strict';

const fs = require('node:fs');
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

/** What a whole-repo run needs to find; without them the linters would have nothing to read. */
const REQUIRED_LAYOUT = ['db/schema.sql', 'app/lib', 'functions/src'];

function parseArgs(argv) {
  const opts = {
    names: [],
    files: null,
    staged: false,
    base: null,
    allowPartial: false,
    root: path.resolve(__dirname, '..', '..'),
  };
  /** The value after a flag; a missing, empty or flag-like one is an error, never a silent default. */
  const valueAfter = (i, flag) => {
    const v = argv[i + 1];
    if (v === undefined || v === '' || v.startsWith('--')) throw new Error(`${flag} needs a value`);
    return v;
  };
  let rootGiven = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--files') {
      opts.files = [];
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) opts.files.push(argv[(i += 1)]);
    } else if (a === '--staged') opts.staged = true;
    else if (a === '--allow-partial') opts.allowPartial = true;
    else if (a === '--base') {
      opts.base = valueAfter(i, a);
      i += 1;
    } else if (a === '--root') {
      opts.root = path.resolve(valueAfter(i, a));
      rootGiven = true;
      i += 1;
    } else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else opts.names.push(a);
  }
  // The escape hatch is for a tree you chose on purpose: on the real repo it would hide a missing path.
  if (opts.allowPartial && !rootGiven)
    throw new Error('--allow-partial only works together with --root');
  const known = LINTERS.map((l) => l.name);
  const unknown = opts.names.filter((n) => !known.includes(n));
  if (unknown.length)
    throw new Error(`unknown linter ${unknown.join(', ')} (known: ${known.join(', ')})`);
  return opts;
}

/** Two literals on one line can report the same thing twice; say it once. */
const unique = (violations) => [
  ...new Map(violations.map((v) => [`${v.file}:${v.line}:${v.rule}:${v.message}`, v])).values(),
];

/** Violations for each required path the tree lacks (whole-repo runs only). */
function layoutViolations(root) {
  return REQUIRED_LAYOUT.filter((rel) => !fs.existsSync(path.join(root, rel))).map((rel) => ({
    file: rel,
    line: 0,
    rule: 'repo-layout',
    message: `missing: the linters need ${rel}; a repo without it would pass by checking nothing (use --allow-partial for a partial tree)`,
  }));
}

/**
 * Runs the selected linters.
 * @returns {{ results: Array<{ name, violations, scanned }>, count: number }}
 * With `layout: true` (whole-repo CLI runs) a missing db/schema.sql, app/lib or functions/src is
 * reported first, as the "repo-layout" result.
 */
function runLinters(opts) {
  const ctx = createContext(opts);
  const selected = LINTERS.filter((l) => opts.names.length === 0 || opts.names.includes(l.name));
  const results = [];
  if (opts.layout)
    results.push({ name: 'repo-layout', violations: layoutViolations(opts.root), scanned: 0 });
  for (const linter of selected) {
    ctx.startCount();
    let violations;
    try {
      violations = unique(linter.run(ctx));
    } catch (err) {
      // A linter that crashes must fail the run, never pass silently.
      violations = [
        { file: '(linter)', line: 0, rule: linter.name, message: `crashed: ${err.stack || err}` },
      ];
    }
    results.push({ name: linter.name, violations, scanned: ctx.scannedCount() });
  }
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
  const { results, count } = runLinters({
    ...opts,
    layout: opts.files === null && !opts.allowPartial,
  });
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  for (const { name, violations, scanned } of results) {
    for (const v of violations) console.log(`${v.file}:${v.line}: ${v.rule}: ${v.message}`);
    const files =
      name === 'repo-layout'
        ? ''
        : ` (${plural(scanned, 'file')}${violations.length ? `, ${violations.length} violation(s)` : ''})`;
    console.log(`${violations.length === 0 ? 'ok  ' : 'FAIL'} ${name}${files}`);
  }
  const linters = results.filter((r) => r.name !== 'repo-layout').length;
  console.log(count === 0 ? `\n${linters} linter(s), 0 violations.` : `\n${count} violation(s).`);
  process.exit(Math.min(count, 255));
}

if (require.main === module) main();

module.exports = { LINTERS, runLinters, parseArgs };
