// migrations-immutable (rule 4, standard §8.2): a committed migration is never edited.
//   names      every .sql / .SQL file anywhere under db/migrations/ must sit directly in that folder
//              (the runner does not read subfolders) and match NNNN_name.sql (four digits, so 0100
//              sorts after 0019, lower case); each number is used once.        (always checked)
//   --staged   a migration already in HEAD may not be modified, deleted or renamed in the index
//              (pre-commit). Adding a new one is fine.
//   --base REF the same, for REF...HEAD (CI, a pull request).
// A change is a NEW migration plus the schema.sql reflection.
'use strict';

const { execFileSync } = require('node:child_process');
const { violation } = require('./lib/context');

const NAME = 'migrations-immutable';
const DIR = 'db/migrations';
const NAME_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;
const SQL_ANYWHERE = /^db\/migrations\/.+\.sql$/i;
const CHANGED = { M: 'modified', D: 'deleted', R: 'renamed', T: 'changed type of' };

function checkNames(ctx, found) {
  const byNumber = new Map();
  for (const file of ctx.repo((f) => SQL_ANYWHERE.test(f))) {
    const rest = file.slice(DIR.length + 1);
    if (rest.includes('/')) {
      found.push(
        violation(
          file,
          1,
          NAME,
          `"${rest}" is in a subfolder: migrations sit directly in db/migrations/ (the runner does not read subfolders, so this one would never run)`,
        ),
      );
    } else if (!NAME_PATTERN.test(rest)) {
      found.push(
        violation(
          file,
          1,
          NAME,
          `"${rest}" must match NNNN_name.sql: four digits, then lower-case letters, digits and underscores, and a lower-case .sql`,
        ),
      );
    } else if (byNumber.has(rest.slice(0, 4))) {
      found.push(
        violation(
          file,
          1,
          NAME,
          `number ${rest.slice(0, 4)} is also used by ${byNumber.get(rest.slice(0, 4))}: every migration has its own number`,
        ),
      );
    } else {
      byNumber.set(rest.slice(0, 4), rest);
    }
  }
}

function checkHistory(ctx, found) {
  const args = ctx.staged
    ? ['diff', '--cached', '--name-status', '-M', '--', DIR]
    : ['diff', '--name-status', '-M', `${ctx.base}...HEAD`, '--', DIR];
  let out;
  try {
    out = execFileSync('git', args, {
      cwd: ctx.root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    found.push(
      violation(
        DIR,
        1,
        NAME,
        `could not ask git what changed (git ${args.slice(0, 3).join(' ')}): ${String(err.stderr || err.message).trim()}`,
      ),
    );
    return;
  }
  for (const line of out.split('\n').filter(Boolean)) {
    const [status, oldPath] = line.split('\t');
    const verb = CHANGED[status[0]];
    if (verb && /\.sql$/i.test(oldPath)) {
      found.push(
        violation(
          oldPath,
          1,
          NAME,
          `committed migration ${verb}: a committed migration is never edited; add a new numbered migration instead (rule 4)`,
        ),
      );
    }
  }
}

function run(ctx) {
  const found = [];
  checkNames(ctx, found);
  if (ctx.staged || ctx.base) checkHistory(ctx, found);
  return found;
}

module.exports = { name: NAME, run };
