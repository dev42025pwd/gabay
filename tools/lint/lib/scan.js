// A small lexer: enough to tell code from comments and strings in JS and Dart sources, so a linter
// never fires on a comment or a string that merely mentions the thing it looks for.
//
//   scan(source, { lang: 'js' | 'dart' }) -> tokens
//   token: { type: 'comment' | 'string' | 'template' | 'regex', start, end, depth, ... }
//     string:   { quote, text }                      text = the characters between the quotes
//     template: { text, hasInterpolation }           JS only; each ${...} is replaced by \0 in text
//   depth is 0 for code, and >0 for a token found inside a template literal's ${...}.
//
// Not a parser. Known limits: Dart string interpolation is left inside its string, and a JS regex
// literal is recognised by the usual "previous character" heuristic.
'use strict';

const REGEX_PRECEDERS = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);

function scan(src, { lang }) {
  const tokens = [];
  const n = src.length;
  const js = lang === 'js';

  /** Scans code from i; with `nested`, stops after the `}` that closes a ${. Returns the next index. */
  function code(i, depth, nested) {
    let braces = 0;
    let last = '';
    while (i < n) {
      const c = src[i];
      const d = src[i + 1];
      if (c === '/' && d === '/') {
        const end = src.indexOf('\n', i);
        const stop = end === -1 ? n : end;
        tokens.push({ type: 'comment', start: i, end: stop, depth });
        i = stop;
      } else if (c === '/' && d === '*') {
        const close = src.indexOf('*/', i + 2);
        const stop = close === -1 ? n : close + 2;
        tokens.push({ type: 'comment', start: i, end: stop, depth });
        i = stop;
      } else if (c === '"' || c === "'") {
        i = quoted(i, depth);
        last = c;
      } else if (js && c === '`') {
        i = template(i, depth);
        last = c;
      } else if (js && c === '/' && REGEX_PRECEDERS.has(last)) {
        const stop = regex(i);
        tokens.push({ type: 'regex', start: i, end: stop, depth });
        i = stop;
        last = ')';
      } else {
        if (nested && c === '{') braces += 1;
        if (nested && c === '}') {
          if (braces === 0) return i + 1;
          braces -= 1;
        }
        if (!/\s/.test(c)) last = c;
        i += 1;
      }
    }
    return i;
  }

  function quoted(start, depth) {
    const q = src[start];
    const triple = lang === 'dart' && src.startsWith(q.repeat(3), start);
    const raw = lang === 'dart' && /(^|[^\w])r$/.test(src.slice(Math.max(0, start - 2), start));
    let i = start + (triple ? 3 : 1);
    for (; i < n; i += 1) {
      const c = src[i];
      if (c === '\\' && !raw) i += 1;
      else if (triple ? src.startsWith(q.repeat(3), i) : c === q) break;
      else if (!triple && c === '\n') break; // unterminated: stop at the line end, never run away
    }
    const bodyStart = start + (triple ? 3 : 1);
    const closed = triple ? src.startsWith(q.repeat(3), i) : src[i] === q;
    const end = Math.min(n, closed ? i + (triple ? 3 : 1) : i);
    tokens.push({ type: 'string', quote: q, raw, start, end, depth, text: src.slice(bodyStart, closed ? i : end) });
    return end;
  }

  function template(start, depth) {
    let i = start + 1;
    let text = '';
    let hasInterpolation = false;
    while (i < n && src[i] !== '`') {
      if (src[i] === '\\') {
        text += src.slice(i, i + 2);
        i += 2;
      } else if (src[i] === '$' && src[i + 1] === '{') {
        hasInterpolation = true;
        text += '\0';
        i = code(i + 2, depth + 1, true);
      } else {
        text += src[i];
        i += 1;
      }
    }
    const end = Math.min(n, i + 1);
    tokens.push({ type: 'template', start, end, depth, text, hasInterpolation });
    return end;
  }

  function regex(start) {
    let i = start + 1;
    let inClass = false;
    for (; i < n && src[i] !== '\n'; i += 1) {
      if (src[i] === '\\') i += 1;
      else if (src[i] === '[') inClass = true;
      else if (src[i] === ']') inClass = false;
      else if (src[i] === '/' && !inClass) break;
    }
    return Math.min(n, i + 1);
  }

  code(0, 0, false);
  return tokens.sort((a, b) => a.start - b.start);
}

/** Maps a character index to its 1-based line number. */
function lineMap(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i += 1) if (src[i] === '\n') starts.push(i + 1);
  return (index) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/** The source with the given token types turned into spaces (newlines kept, so line numbers hold). */
function blank(src, tokens, types) {
  const chars = src.split('');
  for (const t of tokens) {
    if (!types.includes(t.type) || t.depth > 0) continue;
    for (let i = t.start; i < t.end; i += 1) if (chars[i] !== '\n') chars[i] = ' ';
  }
  return chars.join('');
}

/**
 * Source with comments, strings, templates and regexes blanked: only code is left. In Dart a
 * string's ${...} interpolation is code (Text('${Colors.black}') uses a colour), so it is kept.
 */
function codeOnly(src, lang) {
  const tokens = scan(src, { lang });
  const code = blank(src, tokens, ['comment', 'string', 'template', 'regex']);
  if (lang !== 'dart') return code;
  const chars = code.split('');
  for (const t of tokens.filter((x) => x.type === 'string' && !x.raw && x.depth === 0)) {
    for (let i = t.start; i < t.end - 1; i += 1) {
      if (src[i] === '\\') {
        i += 1;
      } else if (src[i] === '$' && src[i + 1] === '{') {
        let depth = 1;
        let j = i + 2;
        for (; j < t.end && depth > 0; j += 1) depth += src[j] === '{' ? 1 : src[j] === '}' ? -1 : 0;
        for (let k = i + 2; k < j - 1; k += 1) chars[k] = src[k];
        i = j - 1;
      }
    }
  }
  return chars.join('');
}

/** Source with only comments blanked (strings kept). */
function withoutComments(src, lang) {
  return blank(src, scan(src, { lang }), ['comment']);
}

module.exports = { scan, lineMap, blank, codeOnly, withoutComments };
