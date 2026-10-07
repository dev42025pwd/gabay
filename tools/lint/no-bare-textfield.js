// no-bare-textfield (rule 7, standard §4.10): a feature's view never builds a TextFormField or
// TextField itself. Forms are FieldSpec projections of the schema, built in shared/forms/.
'use strict';

const { violation } = require('./lib/context');
const { codeOnly, lineMap } = require('./lib/scan');

const NAME = 'no-bare-textfield';
const IN_VIEWS = /^app\/lib\/features\/.+\/views\/.+\.dart$/;
const BARE = /\b(TextFormField|TextField)\s*\(/g;

function run(ctx) {
  const found = [];
  for (const file of ctx.list((f) => IN_VIEWS.test(f))) {
    const code = codeOnly(ctx.read(file), 'dart');
    const lineOf = lineMap(code);
    for (const m of code.matchAll(BARE)) {
      found.push(
        violation(
          file,
          lineOf(m.index),
          NAME,
          `${m[1]}( in a view: declare a FieldSpec and let shared/forms build the widget (rule 7, standard §4.10)`,
        ),
      );
    }
  }
  return found;
}

module.exports = { name: NAME, run };
