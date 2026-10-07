// no-bare-textfield (rule 7, standard §4.10): no code under app/lib builds a text field itself.
// Forms are FieldSpec projections of the schema, built in app/lib/shared/forms/ (Phase 3); that
// folder is the one place a TextField / TextFormField / CupertinoTextField may be constructed.
// Widened from features/**/views/ to all of app/lib by ruling L128. Caught: the constructor call,
// with or without an import prefix (m.TextFormField(), a `.new` tear-off, and a typedef alias of
// one (the alias is flagged where it is declared, which is enough to stop its uses).
'use strict';

const { violation } = require('./lib/context');
const { codeOnly, lineMap } = require('./lib/scan');

const NAME = 'no-bare-textfield';
const IN_LIB = /^app\/lib\/.+\.dart$/;
const ALLOWED_DIR = 'app/lib/shared/forms/';
const WIDGET = '(?:TextField|TextFormField|CupertinoTextField|CupertinoTextFormFieldRow)';
const BUILT = new RegExp(`\\b(${WIDGET})\\s*(?:\\(|\\.\\s*new\\b)`, 'g');
const ALIASED = new RegExp(
  `\\btypedef\\s+\\w+\\s*(?:<[^>]*>)?\\s*=\\s*(?:\\w+\\s*\\.\\s*)?(${WIDGET})\\b`,
  'g',
);

function run(ctx) {
  const found = [];
  for (const file of ctx.list((f) => IN_LIB.test(f) && !f.startsWith(ALLOWED_DIR))) {
    const code = codeOnly(ctx.read(file), 'dart');
    const lineOf = lineMap(code);
    for (const [pattern, what] of [
      [BUILT, 'built here'],
      [ALIASED, 'aliased with a typedef'],
    ]) {
      for (const m of code.matchAll(pattern)) {
        found.push(
          violation(
            file,
            lineOf(m.index),
            NAME,
            `${m[1]} ${what}: declare a FieldSpec and let app/lib/shared/forms build the widget (rule 7, standard §4.10)`,
          ),
        );
      }
    }
  }
  return found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

module.exports = { name: NAME, run };
