// tenant-predicate (rule 2, Blueprint catastrophic set): SQL in functions/src that names a
// tenant-scoped table must bind the tenant. "Tenant-scoped" is read from db/schema.sql: every table
// with a TenantId column (including Tenant itself and the lookup tables). Convention without a lint
// is how the predicate goes missing (standard §3.5).
//
// Before checking, SQL comments and 'string literals' are blanked, and the text is split into
// statements (a multi-statement text must satisfy the rule per statement). Then:
//   SELECT / UPDATE / DELETE   the part after WHERE must bind TenantId to a parameter:
//                              TenantId = $n, TenantId = ANY($n), TenantId IN ($n, ...), or $n = TenantId
//                              ("TenantId = $1 OR TenantId IS NULL" is fine: the lookup-table shape).
//                              A join on TenantId, <>, IS NOT NULL, a literal or a comment is not a binding.
//   INSERT ... VALUES          TenantId must be in the column list and each row's value for it a $n.
//   INSERT ... SELECT          the SELECT's WHERE must bind TenantId, as above.
//   runPaged({ ... })          the call is read as  SELECT .. FROM <from> <join> WHERE <where>  from its
//                              literals; a where that is not a literal cannot be checked and fails.
//
// A genuine cross-tenant PLATFORM query is marked on the line above the SQL (or the runPaged call):
//     // tenant-scope: <reason>      (a reason is required)
// Not checked: a table name that is interpolated (gabay.${table}); sql-interpolation covers that.
// Accepted limit: it is a text check, so "TenantId = $1 OR 1 = 1" passes; that is a review item.
'use strict';

const { violation } = require('./lib/context');
const { findSql, findRunPagedCalls, annotation } = require('./lib/sql');
const { parseSchema, splitTopLevel } = require('./lib/schema');

const NAME = 'tenant-predicate';
const TAG = 'tenant-scope';
const SCHEMA = 'db/schema.sql';
const IN_API = /^functions\/src\/.+\.js$/;
const TABLE_REF = /\bgabay\.(\w+)|\b(?:FROM|JOIN|INTO|UPDATE)\s+(?!gabay\.)(\w+)/gi;
const BOUND =
  /\bTenantId\s*(?:=\s*(?:ANY\s*\(\s*)?\$\d+|IN\s*\(\s*\$\d+)|\$\d+\s*=\s*(?:\w+\.)?TenantId\b/i;
const PARAMETER = /^\$\d+(?:\s*::\s*\w+)?$/;

/** Blanks -- and block comments and 'string literals' (so a mention of TenantId in one is not a predicate). */
function cleanSql(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '-' && text[i + 1] === '-') {
      while (i < text.length && text[i] !== '\n') i += 1;
      out += ' ';
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
      out += ' ';
    } else if (c === "'") {
      i += 1;
      while (i < text.length) {
        if (text[i] === "'" && text[i + 1] === "'") i += 2;
        else if (text[i++] === "'") break;
      }
      out += "''";
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

/** The parenthesised groups at the start of a VALUES list: "($1, $2), ($1, $3) ON CONFLICT" -> two groups. */
function valueRows(text) {
  const rows = [];
  let i = 0;
  while (i < text.length) {
    if (/[\s,]/.test(text[i])) i += 1;
    else if (text[i] === '(') {
      let depth = 1;
      let j = i + 1;
      for (; j < text.length && depth > 0; j += 1) depth += text[j] === '(' ? 1 : text[j] === ')' ? -1 : 0;
      rows.push(text.slice(i + 1, j - 1));
      i = j;
    } else break;
  }
  return rows;
}

/** null when the statement is fine, else what is wrong with it. */
function problemWith(statement) {
  const insert = /^\s*INSERT\s+INTO\s+(?:gabay\.)?\w+\s*\(([^)]*)\)\s*VALUES\s*([\s\S]*)$/i.exec(statement);
  if (insert) {
    const at = insert[1].split(',').map((c) => c.trim().toLowerCase()).indexOf('tenantid');
    if (at === -1) return 'INSERT has no TenantId column';
    const rows = valueRows(insert[2]);
    const bound = rows.length > 0 && rows.every((row) => PARAMETER.test((splitTopLevel(row)[at] ?? '').trim()));
    return bound ? null : 'INSERT does not bind TenantId to a $n parameter in every row';
  }
  const where = /\bWHERE\b([\s\S]*)$/i.exec(statement);
  return where && BOUND.test(where[1]) ? null : 'has no TenantId = $n predicate in its WHERE';
}

/** [problem, tables] for the first failing statement of `text` that touches a tenant-scoped table, or null. */
function check(text, scoped) {
  for (const statement of cleanSql(text).split(';').map((s) => s.trim()).filter(Boolean)) {
    const tables = [...new Set([...statement.matchAll(TABLE_REF)].map((m) => (m[1] ?? m[2]).toLowerCase()))].filter((t) => scoped.has(t));
    if (tables.length === 0) continue;
    const problem = problemWith(statement);
    if (problem) return [problem, tables];
  }
  return null;
}

function run(ctx) {
  if (!ctx.exists(SCHEMA)) return [];
  const { tables } = parseSchema(ctx.read(SCHEMA));
  const scoped = new Set([...tables].filter(([, t]) => t.columns.has('tenantid')).map(([k]) => k));
  const found = [];
  for (const file of ctx.list((f) => IN_API.test(f), { widenOn: [SCHEMA] })) {
    const src = ctx.read(file);
    const sites = [
      ...findSql(src).filter((s) => s.statement).map((s) => ({ line: s.line, text: s.text, what: 'SQL' })),
      ...findRunPagedCalls(src).map((c) => ({ line: c.line, text: c.text, what: 'runPaged call', literal: c.whereLiteral, unreadable: c.unreadable })),
    ];
    for (const site of sites) {
      const bad = site.unreadable ? true : check(site.text, scoped);
      if (!bad) continue;
      const note = annotation(src, site.line, TAG);
      if (note && note.reason) continue;
      if (site.unreadable) {
        found.push(
          violation(
            file,
            site.line,
            NAME,
            note
              ? `// ${TAG}: needs a reason after the colon (rule 2)`
              : `runPaged call cannot be checked: ${site.unreadable}; from and where must be string literals at the call site so the tenant predicate can be checked (rule 2), or mark a platform query with // ${TAG}: <reason>`,
          ),
        );
        continue;
      }
      const [problem, names] = bad;
      const hint = site.literal === false ? ' (where must be a string literal at the call site so the predicate can be checked)' : '';
      found.push(
        violation(
          file,
          site.line,
          NAME,
          note
            ? `// ${TAG}: needs a reason after the colon (rule 2)`
            : `${site.what} on tenant-scoped table ${names.join(', ')} ${problem}${hint} (rule 2); bind req.tenantCompanyID as a $n parameter, or mark a platform query with // ${TAG}: <reason>`,
        ),
      );
    }
  }
  return found;
}

module.exports = { name: NAME, run };
