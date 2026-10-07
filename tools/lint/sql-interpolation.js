// sql-interpolation (rule 3): a value from the request never goes into SQL text. Values are $1..$n
// parameters. Two shapes are refused in functions/src:
//   1. a template literal that holds SQL and a ${...}
//   2. a SQL string joined to a variable with +
// The one allowed exception is an identifier taken from an allow-list map (a sort column, a table
// name), marked on the line directly above the literal:   // sql-identifiers: <why this is safe>
// The reason is required. The gate's bad commit, query(`SELECT ... '${name}'`, []), fails here.
'use strict';

const { violation } = require('./lib/context');
const { findSql, annotation } = require('./lib/sql');
const { scan } = require('./lib/scan');

const NAME = 'sql-interpolation';
const TAG = 'sql-identifiers';
const IN_API = /^functions\/src\/.+\.js$/;
const QUOTED_SHAPE =
  'a ${} wrapped in single quotes is treated as SQL; bind it as $n, or if this is not SQL use double quotes';
const QUOTES = new Set(['"', "'", '`']);

/** True when `+` joins this literal to something that is not another literal. */
function joinedToVariable(src, token, byStart) {
  const before = /(\S)\s*\+\s*$/.exec(src.slice(0, token.start));
  if (before && !QUOTES.has(before[1])) return true;
  let end = token.end;
  for (;;) {
    const after = /^\s*\+(?![+=])\s*/.exec(src.slice(end));
    if (!after) return false;
    const next = end + after[0].length;
    if (!QUOTES.has(src[next])) return true; // + a variable, a call, a number...
    const literal = byStart.get(next);
    if (!literal) return true;
    end = literal.end; // + another literal: keep following the chain
  }
}

function run(ctx) {
  const found = [];
  for (const file of ctx.list((f) => IN_API.test(f))) {
    const src = ctx.read(file);
    const byStart = new Map(scan(src, { lang: 'js' }).map((t) => [t.start, t]));
    for (const sql of findSql(src)) {
      const shape = sql.hasInterpolation
        ? sql.quotedOnly
          ? QUOTED_SHAPE
          : 'a ${...} inside SQL text'
        : joinedToVariable(src, sql, byStart)
          ? 'SQL text joined to a variable with +'
          : null;
      if (!shape) continue;
      const note = annotation(src, sql.line, TAG);
      if (note && note.reason) continue;
      found.push(
        violation(
          file,
          sql.line,
          NAME,
          note
            ? `// ${TAG}: needs a reason after the colon (rule 3)`
            : shape === QUOTED_SHAPE
              ? `${QUOTED_SHAPE} (rule 3); an identifier from an allow-list map is marked with // ${TAG}: <reason>`
              : `${shape}: bind values as $1..$n parameters; identifiers only from an allow-list map, marked with // ${TAG}: <reason> (rule 3)`,
        ),
      );
    }
  }
  return found;
}

module.exports = { name: NAME, run };
