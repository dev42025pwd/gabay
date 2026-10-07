// Finds SQL text in JS source, for sql-interpolation and tenant-predicate.
//
// A string or template literal is "SQL" when it contains an upper-case SQL keyword (SELECT, FROM,
// WHERE, ORDER BY, INSERT INTO, ...) or a gabay.<name> reference. Upper-case only, on purpose: it
// is how this codebase writes SQL, and it keeps an English message such as "select an item from the
// list" out. A lower-case statement that names gabay.<table> is still found.
//
// An annotation is a comment on the line directly above the literal:  // <tag>: <reason>
// The reason is required; an empty one is itself a violation (see annotationProblem).
'use strict';

const { scan, lineMap } = require('./scan');

const KEYWORD =
  /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|WITH|WHERE|ORDER\s+BY|GROUP\s+BY|LIMIT|OFFSET|JOIN|VALUES|FROM)\b/;
const SCHEMA_REF = /\bgabay\./i;
const STATEMENT = /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|WITH)\b/;

const looksLikeSql = (text) => KEYWORD.test(text) || SCHEMA_REF.test(text);
const looksLikeStatement = (text) => STATEMENT.test(text) || (SCHEMA_REF.test(text) && /\b(select|insert|update|delete)\b/i.test(text));

/**
 * @returns {Array<{ type, text, line, start, end, hasInterpolation, statement }>} the SQL-looking
 * string and template literals in code (not in comments, not nested inside a ${...}).
 */
function findSql(src) {
  const tokens = scan(src, { lang: 'js' });
  const lineOf = lineMap(src);
  return tokens
    .filter((t) => (t.type === 'string' || t.type === 'template') && t.depth === 0 && looksLikeSql(t.text))
    .map((t) => ({
      type: t.type,
      text: t.text,
      line: lineOf(t.start),
      start: t.start,
      end: t.end,
      hasInterpolation: !!t.hasInterpolation,
      statement: looksLikeStatement(t.text),
    }));
}

/**
 * The annotation `// <tag>: <reason>` on the line above `line`.
 * @returns {null | { reason: string }} null when there is none
 */
function annotation(src, line, tag) {
  const above = src.split('\n')[line - 2] ?? '';
  const m = new RegExp(`^\\s*//\\s*${tag}:(.*)$`).exec(above);
  return m ? { reason: m[1].trim() } : null;
}

module.exports = { findSql, annotation };
