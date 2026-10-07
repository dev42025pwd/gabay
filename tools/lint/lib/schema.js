// Reads db/schema.sql (PostgreSQL) into a map of tables and columns, for the linters that need to
// know the schema: schema-drops, schema-forms and tenant-predicate. Reads only what those need.
//
//   parseSchema(text) -> { tables: Map(lowerName -> { name, line, columns: Map(lowerName -> col) }),
//                          drops:  Map(lowerName -> line) }
//   col: { name, line, type, array, length, precision, scale, nullable, hasDefault, identity, isFk }
//
// Identifiers are never quoted in this schema (header of schema.sql), so names compare lower-cased.
'use strict';

const TABLE_CONSTRAINT = new Set([
  'constraint',
  'primary',
  'unique',
  'foreign',
  'check',
  'exclude',
  'like',
]);

/** Blanks block and -- comments, keeping every newline. */
function stripSqlComments(text) {
  const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  return noBlock
    .split('\n')
    .map((line) => {
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        if (line[i] === "'") quoted = !quoted;
        else if (!quoted && line[i] === '-' && line[i + 1] === '-') return line.slice(0, i);
      }
      return line;
    })
    .join('\n');
}

/** Splits on commas that are not inside parentheses, trimming each part and dropping empties. */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') depth -= 1;
    else if (text[i] === ',' && depth === 0) {
      parts.push(text.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(text.slice(from));
  return parts.map((p) => p.trim()).filter(Boolean);
}

function parseColumn(name, rest, line) {
  const t = /^(\w+(?:\s+PRECISION)?)\s*(\[\])?\s*(?:\(\s*(\d+)\s*(?:,\s*(\d+)\s*)?\))?/i.exec(rest);
  const type = t ? t[1].toUpperCase().replace(/\s+/g, ' ') : 'UNKNOWN';
  const identity = /\bGENERATED\b/i.test(rest);
  const two = t && t[4] !== undefined;
  return {
    name,
    line,
    type,
    array: !!(t && t[2]),
    // Only CHAR and VARCHAR parentheses are a length (TIMESTAMPTZ(3) is fractional-second precision).
    length: t && t[3] !== undefined && !two && /^(VARCHAR|CHAR)$/.test(type) ? Number(t[3]) : null,
    precision: two ? Number(t[3]) : null,
    scale: two ? Number(t[4]) : null,
    nullable: !(/\bNOT\s+NULL\b/i.test(rest) || /\bPRIMARY\s+KEY\b/i.test(rest) || identity),
    hasDefault: identity || /\bDEFAULT\b/i.test(rest),
    identity,
    isFk: /\bREFERENCES\b/i.test(rest),
  };
}

function parseSchema(text) {
  const lines = stripSqlComments(text).split('\n');
  const tables = new Map();
  const drops = new Map();
  let table = null;
  let indent = null;
  let lastItem = null; // the line item the next deeper-indented line continues

  lines.forEach((raw, i) => {
    const line = i + 1;
    if (!table) {
      const create = /^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:gabay\.)?(\w+)\s*\(/i.exec(
        raw,
      );
      if (create) {
        table = { name: create[1], line, columns: new Map() };
        tables.set(create[1].toLowerCase(), table);
        indent = null;
        lastItem = null;
        return;
      }
      const drop = /^\s*DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:gabay\.)?(\w+)/i.exec(raw);
      if (drop) drops.set(drop[1].toLowerCase(), line);
      return;
    }
    if (/^\)\s*;?\s*$/.test(raw)) {
      table = null;
      return;
    }
    if (!raw.trim()) return;
    const depth = raw.length - raw.trimStart().length;
    indent ??= depth;
    if (depth > indent && lastItem) {
      lastItem.text += ` ${raw.trim()}`; // a continuation line
      return;
    }
    if (!/^\s*[A-Za-z_]/.test(raw)) return;
    lastItem = { text: raw.trim(), line };
    (table.items ??= []).push(lastItem);
  });

  // Items are finished only now, so continuation lines are part of their text. One line may hold
  // several definitions ("Code VARCHAR(40) NOT NULL, Label VARCHAR(100) NOT NULL,").
  for (const t of tables.values()) {
    const constraints = [];
    for (const item of t.items ?? []) {
      for (const def of splitTopLevel(item.text)) {
        const m = /^([A-Za-z_]\w*)\s*(.*)$/s.exec(def);
        if (!m) continue;
        if (TABLE_CONSTRAINT.has(m[1].toLowerCase())) constraints.push(def);
        else t.columns.set(m[1].toLowerCase(), parseColumn(m[1], m[2], item.line));
      }
    }
    // A table-level FOREIGN KEY (a, b) REFERENCES ... makes those columns foreign keys too.
    for (const def of constraints) {
      const fk = /FOREIGN\s+KEY\s*\(([^)]*)\)/i.exec(def);
      for (const col of fk ? fk[1].split(',') : []) {
        const c = t.columns.get(col.trim().toLowerCase());
        if (c) c.isFk = true;
      }
    }
    delete t.items;
  }
  return { tables, drops };
}

module.exports = { parseSchema, splitTopLevel };
