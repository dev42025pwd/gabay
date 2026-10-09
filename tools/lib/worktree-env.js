// The .env of a working copy (plan/PH1-worktrees.md 1.1, WT-5): the main .env with only PGDATABASE changed. It works
// on the text, line by line, so every other byte (comments, spacing, quotes, line ends) stays as it was, and it never
// prints a value. Plain CommonJS, no dependencies, any Node >= 22.
'use strict';

const { parseEnv } = require('node:util');

/** A line that sets PGDATABASE: optional spaces, optional `export`, the key, `=`, then the value up to the line end. */
const PGDATABASE_LINE = /^([ \t]*(?:export[ \t]+)?PGDATABASE[ \t]*=[ \t]*)[^\r\n]*?([ \t]*)$/;

/**
 * `text` with the value of every PGDATABASE line set to `database`. A line break (LF or CRLF) and a missing final
 * newline are kept; spaces after the value are kept. Throws when there is no PGDATABASE line.
 */
function withDatabase(text, database) {
  let found = false;
  const lines = text.split('\n').map((raw) => {
    const crlf = raw.endsWith('\r');
    const line = crlf ? raw.slice(0, -1) : raw;
    const match = PGDATABASE_LINE.exec(line);
    if (!match) return raw;
    found = true;
    return `${match[1]}${database}${match[2]}${crlf ? '\r' : ''}`;
  });
  if (!found) throw new Error('The main .env has no PGDATABASE line: add one (see .env.example).');
  return lines.join('\n');
}

/** The PG connection values of an .env text, for the code that connects. Never log what this returns. */
function connectionFrom(text) {
  const env = parseEnv(text);
  const missing = ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD'].filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(`The main .env is missing ${missing.join(', ')} (see .env.example).`);
  }
  return {
    host: env.PGHOST,
    port: Number(env.PGPORT),
    user: env.PGUSER,
    password: env.PGPASSWORD,
  };
}

module.exports = { withDatabase, connectionFrom };
