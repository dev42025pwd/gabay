// schema-forms (standard §7.2, §4.10, Appendix A.13): the schema-to-form drift linter. A form field
// is a projection of the column it writes to; this fails when a FieldSpec disagrees with db/schema.sql
// on type kind, nullability, maxLength or scale, naming the table, the column and the spec's file.
//
// THE DART SHAPE THIS LINTER PARSES (app/lib/shared/forms/field_spec.dart matches it, S9; A.13's constructor plus one
// added argument, `table`, because A.13's `name` is the column and a column needs its table):
//
//   FieldSpec(
//     table: 'Venue',            // string literal: the schema table (an optional "gabay." prefix is fine)
//     name: 'Name',              // string literal: the COLUMN name, A.13's join key
//     label: 'Venue name',       // anything (not checked)
//     kind: ColKind.text,        // ColKind.<text|memo|integer|decimal|money|date|datetime|flag|fk|fkMulti>
//     required: true,            // bool literal, default false
//     maxLength: 120,            // int literal, default absent
//     scale: 4,                  // int literal, default absent
//     readOnly: false,           // bool literal; true skips required/maxLength/scale (identity, audit columns)
//     lookup: 'venues',          // anything (not checked)
//     format: FieldFormat.email, // anything (not checked): any other named argument is ignored
//   )
//
// table, name and kind must be literals, otherwise the spec cannot be checked and that is reported.
// The class declaration (`const FieldSpec({ ... })`) is not a spec and is skipped.
//
// RULES (DESIGN CHOICES, each a stated reading of A.13):
//   kind:       VARCHAR/CHAR -> text|memo; TEXT -> text|memo; JSONB -> memo; UUID -> text;
//               INT/BIGINT/SMALLINT -> integer, or fk|fkMulti when the column is a foreign key;
//               DECIMAL/NUMERIC -> decimal|money; DATE -> date; TIMESTAMPTZ/TIMESTAMP -> datetime;
//               BOOLEAN -> flag. Anything else (arrays, BYTEA) has no form kind.
//   required:   a NOT NULL column without a default must be required: true; a nullable column must
//               not be; a NOT NULL column that has a default may be either.
//   maxLength:  VARCHAR(n)/CHAR(n) must say maxLength: n; no other column may set it.
//   scale:      DECIMAL(p,s) must say scale: s; no other column may set it.
'use strict';

const { violation } = require('./lib/context');
const { withoutComments, lineMap } = require('./lib/scan');
const { parseSchema } = require('./lib/schema');

const NAME = 'schema-forms';
const SCHEMA = 'db/schema.sql';
const DART_IN_LIB = /^app\/lib\/.+\.dart$/;

/** The ColKind values each column type may use. */
function kindsFor(col) {
  if (col.array) return [];
  if (col.isFk && /^(INT|INTEGER|BIGINT|SMALLINT)$/.test(col.type)) return ['fk', 'fkMulti'];
  const byType = {
    VARCHAR: ['text', 'memo'],
    CHAR: ['text', 'memo'],
    TEXT: ['text', 'memo'],
    JSONB: ['memo'],
    UUID: ['text'],
    INT: ['integer'],
    INTEGER: ['integer'],
    BIGINT: ['integer'],
    SMALLINT: ['integer'],
    DECIMAL: ['decimal', 'money'],
    NUMERIC: ['decimal', 'money'],
    DATE: ['date'],
    TIMESTAMPTZ: ['datetime'],
    TIMESTAMP: ['datetime'],
    BOOLEAN: ['flag'],
  };
  return byType[col.type] ?? [];
}

/** Splits "a: 1, b: f(x, y)" at top-level commas, skipping strings. */
function splitArgs(text) {
  const parts = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === "'" || c === '"') {
      for (i += 1; i < text.length && text[i] !== c; i += 1) if (text[i] === '\\') i += 1;
    } else if ('([{'.includes(c)) depth += 1;
    else if (')]}'.includes(c)) depth -= 1;
    else if (c === ',' && depth === 0) {
      parts.push(text.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(text.slice(from));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** A Dart literal as a JS value, or undefined when it is not a plain literal. */
function literal(raw) {
  let m;
  if ((m = /^(['"])(.*)\1$/s.exec(raw))) return m[2];
  if ((m = /^ColKind\.(\w+)$/.exec(raw))) return m[1];
  if (raw === 'true' || raw === 'false') return raw === 'true';
  if (/^-?\d+$/.test(raw)) return Number(raw);
  return undefined;
}

/** Every FieldSpec(...) call in a Dart file: [{ line, args: { name: value|undefined }, positional }]. */
function findFieldSpecs(src) {
  const text = withoutComments(src, 'dart');
  const lineOf = lineMap(text);
  const specs = [];
  for (const m of text.matchAll(/\bFieldSpec\s*\(/g)) {
    const open = m.index + m[0].length;
    if (/^\s*\{/.test(text.slice(open))) continue; // the constructor declaration
    let depth = 1;
    let end = open;
    for (; end < text.length && depth > 0; end += 1) {
      const c = text[end];
      if (c === "'" || c === '"') {
        for (end += 1; end < text.length && text[end] !== c; end += 1)
          if (text[end] === '\\') end += 1;
      } else if (c === '(') depth += 1;
      else if (c === ')') depth -= 1;
    }
    const args = {};
    let positional = false;
    for (const part of splitArgs(text.slice(open, end - 1))) {
      const named = /^(\w+)\s*:\s*([\s\S]*)$/.exec(part);
      if (named) args[named[1]] = literal(named[2].trim());
      else positional = true;
    }
    specs.push({ line: lineOf(m.index), args, positional });
  }
  return specs;
}

function checkSpec(spec, tables, report) {
  const { args } = spec;
  if (spec.positional || [args.table, args.name, args.kind].some((v) => typeof v !== 'string')) {
    return report(
      spec,
      'FieldSpec needs named literal table:, name: and kind: arguments so it can be checked against schema.sql',
    );
  }
  const tableName = args.table.replace(/^gabay\./i, '');
  const table = tables.get(tableName.toLowerCase());
  if (!table) return report(spec, `table "${tableName}" is not in db/schema.sql`);
  const col = table.columns.get(args.name.toLowerCase());
  if (!col) return report(spec, `${table.name}.${args.name}: no such column in db/schema.sql`);
  const where = `${table.name}.${col.name}`;
  const typeText = col.type + (col.array ? '[]' : '');

  const kinds = kindsFor(col);
  if (!kinds.includes(args.kind)) {
    return report(
      spec,
      `${where} is ${typeText}: kind must be ${kinds.length ? kinds.join(' or ') : 'none (no form kind exists)'}, not ${args.kind}`,
    );
  }
  if (args.readOnly === true) return undefined;

  const required = args.required === true;
  if (!col.nullable && !col.hasDefault && !required)
    report(spec, `${where} is NOT NULL: the spec must say required: true`);
  if (col.nullable && required)
    report(spec, `${where} is nullable: the spec must not say required: true`);
  if (col.length !== null && args.maxLength !== col.length) {
    report(
      spec,
      `${where} is ${typeText}(${col.length}): maxLength must be ${col.length}, spec has ${args.maxLength ?? 'none'}`,
    );
  }
  if (col.length === null && args.maxLength !== undefined)
    report(spec, `${where} has no length: remove maxLength: ${args.maxLength}`);
  if (col.scale !== null && args.scale !== col.scale) {
    report(
      spec,
      `${where} is ${typeText}(${col.precision},${col.scale}): scale must be ${col.scale}, spec has ${args.scale ?? 'none'}`,
    );
  }
  if (col.scale === null && args.scale !== undefined)
    report(spec, `${where} has no scale: remove scale: ${args.scale}`);
  return undefined;
}

function run(ctx) {
  if (!ctx.exists(SCHEMA)) return [];
  const { tables } = parseSchema(ctx.read(SCHEMA));
  const found = [];
  // A schema change can break specs that did not change, so it widens the check to every Dart file.
  for (const file of ctx.list((f) => DART_IN_LIB.test(f), { widenOn: [SCHEMA] })) {
    const report = (spec, message) => found.push(violation(file, spec.line, NAME, message));
    for (const spec of findFieldSpecs(ctx.read(file))) checkSpec(spec, tables, report);
  }
  return found;
}

module.exports = { name: NAME, run, findFieldSpecs };
