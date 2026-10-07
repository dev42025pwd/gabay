// tenant-predicate (rule 2, Blueprint catastrophic set): SQL in functions/src that names a
// tenant-scoped table must carry a TenantId predicate. "Tenant-scoped" is read from db/schema.sql:
// every table with a TenantId column (including Tenant itself and the lookup tables, where
// "TenantId = $1 OR TenantId IS NULL" is the predicate). Convention without a lint is how the
// predicate goes missing (standard §3.5).
//
// A predicate is "TenantId" followed by =, <>, !=, IN or IS (so a join or a WHERE both count); an
// INSERT needs TenantId in its column list. A genuine cross-tenant PLATFORM query is marked on the
// line above the SQL:   // tenant-scope: <reason>   (reason required).
// Not checked: SQL whose table name is interpolated (gabay.${table}); sql-interpolation covers that.
'use strict';

const { violation } = require('./lib/context');
const { findSql, annotation } = require('./lib/sql');
const { parseSchema } = require('./lib/schema');

const NAME = 'tenant-predicate';
const TAG = 'tenant-scope';
const SCHEMA = 'db/schema.sql';
const IN_API = /^functions\/src\/.+\.js$/;
const PREDICATE = /\bTenantId\s*(=|<>|!=|\bIN\b|\bIS\b)/i;
const TABLE_REF = /\bgabay\.(\w+)|\b(?:FROM|JOIN|INTO|UPDATE)\s+(?!gabay\.)(\w+)/gi;

function run(ctx) {
  if (!ctx.exists(SCHEMA)) return [];
  const { tables } = parseSchema(ctx.read(SCHEMA));
  const scoped = new Set([...tables].filter(([, t]) => t.columns.has('tenantid')).map(([k]) => k));
  const found = [];
  for (const file of ctx.list((f) => IN_API.test(f), { widenOn: [SCHEMA] })) {
    const src = ctx.read(file);
    for (const sql of findSql(src).filter((s) => s.statement)) {
      const named = [...sql.text.matchAll(TABLE_REF)]
        .map((m) => (m[1] ?? m[2]).toLowerCase())
        .filter((name) => scoped.has(name));
      if (named.length === 0) continue;
      const isInsert = /\bINSERT\s+INTO\b/i.test(sql.text);
      const ok = isInsert ? /\bTenantId\b/i.test(sql.text) : PREDICATE.test(sql.text);
      if (ok) continue;
      const note = annotation(src, sql.line, TAG);
      if (note && note.reason) continue;
      found.push(
        violation(
          file,
          sql.line,
          NAME,
          note
            ? `// ${TAG}: needs a reason after the colon (rule 2)`
            : `SQL on tenant-scoped table ${[...new Set(named)].join(', ')} has no TenantId predicate (rule 2); take it from req.tenantCompanyID, or mark a platform query with // ${TAG}: <reason>`,
        ),
      );
    }
  }
  return found;
}

module.exports = { name: NAME, run };
