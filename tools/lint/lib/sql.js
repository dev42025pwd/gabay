// Finds SQL text in JS source, for sql-interpolation and tenant-predicate.
//
// A string or template literal is "SQL" when it contains an upper-case SQL word (SELECT, FROM,
// WHERE, ORDER BY, AND, INSERT INTO, ...) or a gabay.<name> reference. Upper-case only, on purpose:
// it is how this codebase writes SQL, and it keeps an English message such as "select an item from
// the list" out. A template that has a ${...} is ALSO SQL when
//   - it is the value of a select / from / where / orderBy / join / groupBy / having key (the shape
//     runPaged takes), or
//   - it wraps an interpolation in quotes ('${x}'), or
//   - it holds a $n placeholder.
// Literals nested inside a ${...} are found too (a ternary that adds a WHERE is still SQL).
//
// An annotation is a comment on the line directly above the literal:  // <tag>: <reason>
// The reason is required; an empty one is itself a violation.
'use strict';

const { scan, blank, lineMap } = require('./scan');

const KEYWORD =
  /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|WITH|WHERE|ORDER\s+BY|GROUP\s+BY|LIMIT|OFFSET|JOIN|VALUES|FROM|AND|OR|LIKE|ILIKE|BETWEEN|HAVING|SET)\b/;
const SCHEMA_REF = /\bgabay\./i;
const STATEMENT = /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|WITH)\b/;
const SQL_KEY = /\b(select|from|where|orderBy|join|joins|groupBy|having)\s*:\s*$/;
const QUOTED_INTERPOLATION = /'[^'\n]*\0[^'\n]*'/;
const PLACEHOLDER = /\$\d+/;

const looksLikeSql = (text) => KEYWORD.test(text) || SCHEMA_REF.test(text);
const looksLikeStatement = (text) =>
  STATEMENT.test(text) || (SCHEMA_REF.test(text) && /\b(select|insert|update|delete)\b/i.test(text));

/** A literal's text with its JS escapes of quotes and backslashes undone, so SQL quotes read as quotes. */
const unescape = (text) => text.replace(/\\(['"`\\])/g, '$1');

/**
 * @returns {Array<{ type, text, line, start, end, hasInterpolation, statement }>} the SQL-looking
 * string and template literals in code (never in comments), at any nesting depth.
 */
function findSql(src) {
  const tokens = scan(src, { lang: 'js' });
  const lineOf = lineMap(src);
  const found = [];
  for (const t of tokens) {
    if (t.type !== 'string' && t.type !== 'template') continue;
    const text = unescape(t.text);
    const fragment =
      t.type === 'template' &&
      t.hasInterpolation &&
      (SQL_KEY.test(src.slice(Math.max(0, t.start - 60), t.start)) ||
        QUOTED_INTERPOLATION.test(text) ||
        PLACEHOLDER.test(text));
    if (!looksLikeSql(text) && !fragment) continue;
    // True when the quote-wrapped ${} is the ONLY reason this reads as SQL (so the message can say why).
    const quotedOnly =
      fragment &&
      !looksLikeSql(text) &&
      !SQL_KEY.test(src.slice(Math.max(0, t.start - 60), t.start)) &&
      !PLACEHOLDER.test(text);
    found.push({
      quotedOnly,
      type: t.type,
      text,
      line: lineOf(t.start),
      start: t.start,
      end: t.end,
      hasInterpolation: !!t.hasInterpolation,
      statement: looksLikeStatement(text),
    });
  }
  return found;
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

/** Top-level properties of the object literal opening at src[open]: [{ key, valueStart, valueEnd }]. */
function objectProps(src, topTokens, open) {
  const props = [];
  const push = (from, end) => {
    if (/^\s*\.\.\./.test(src.slice(from, end))) props.push({ key: '...', valueStart: null, valueEnd: end });
    const head = /^\s*([A-Za-z_$][\w$]*)\s*(:)?/.exec(src.slice(from, end));
    if (head) props.push({ key: head[1], valueStart: head[2] ? from + head[0].length : null, valueEnd: end });
  };
  let depth = 0;
  let from = open + 1;
  for (let i = open; i < src.length; i += 1) {
    const t = topTokens.get(i);
    if (t) {
      i = t.end - 1;
      continue;
    }
    const c = src[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') {
      depth -= 1;
      if (depth === 0) {
        push(from, i);
        break;
      }
    } else if (c === ',' && depth === 1) {
      push(from, i);
      from = i + 1;
    }
  }
  return props;
}

/**
 * The literal text of a property value: its string and template literals joined, with \0 where a
 * variable or call sits between them. `literal` is false when the value is not made of literals only.
 */
function literalValue(src, strings, start, end) {
  const own = strings.filter((t) => t.start >= start && t.end <= end);
  let text = '';
  let at = start;
  let literal = own.length > 0;
  for (const t of own) {
    if (src.slice(at, t.start).replace(/[\s+]/g, '')) {
      text += '\0';
      literal = false;
    }
    text += unescape(t.text);
    at = t.end;
  }
  if (src.slice(at, end).replace(/[\s+]/g, '')) {
    text += '\0';
    literal = false;
  }
  return { text, literal };
}

/**
 * Every runPaged({ ... }) call (not its declaration), as the statement it will run:
 * SELECT <select> FROM <from> <join> WHERE <where>.
 * `unreadable` is a reason string when the call cannot be read as a statement: the argument is not
 * an object literal, the object has a ... spread, or `from` is missing or not a literal. (A `where`
 * that is not a literal is reported through `whereLiteral`, and only matters on a tenant table.)
 * @returns {Array<{ line: number, text: string, whereLiteral: boolean, unreadable: string|null }>}
 */
function findRunPagedCalls(src) {
  const tokens = scan(src, { lang: 'js' });
  const clean = blank(src, tokens, ['comment']);
  const topTokens = new Map(tokens.filter((t) => t.depth === 0).map((t) => [t.start, t]));
  const strings = tokens.filter((t) => t.depth === 0 && (t.type === 'string' || t.type === 'template'));
  const lineOf = lineMap(src);
  const calls = [];
  for (const m of clean.matchAll(/\brunPaged\s*\(/g)) {
    const inLiteral = strings.some((t) => m.index > t.start && m.index < t.end);
    const declaration = /\bfunction\s*\*?\s*$/.test(clean.slice(Math.max(0, m.index - 20), m.index));
    if (inLiteral || declaration) continue;
    const rest = clean.slice(m.index + m[0].length);
    const brace = /^\s*\{/.exec(rest);
    if (!brace) {
      const line = lineOf(m.index);
      calls.push({ line, text: '', whereLiteral: false, unreadable: 'the argument is not an object literal' });
      continue;
    }
    const props = objectProps(clean, topTokens, m.index + m[0].length + brace[0].length - 1);
    const value = (...keys) => {
      const p = props.find((x) => keys.includes(x.key) && x.valueStart !== null);
      return p ? literalValue(clean, strings, p.valueStart, p.valueEnd) : null;
    };
    const select = value('select');
    const from = value('from');
    const join = value('join', 'joins');
    const where = value('where');
    const text = [
      `SELECT ${select ? select.text : '*'} FROM ${from ? from.text : '\0'}`,
      join ? join.text : '',
      where ? `WHERE ${where.text}` : '',
    ].join(' ');
    const unreadable = props.some((p) => p.key === '...')
      ? 'the object has a ... spread'
      : !from || !from.literal
        ? 'from is missing or is not a string literal'
        : null;
    calls.push({ line: lineOf(m.index), text, whereLiteral: !!where && where.literal, unreadable });
  }
  return calls;
}

module.exports = { findSql, annotation, findRunPagedCalls };
