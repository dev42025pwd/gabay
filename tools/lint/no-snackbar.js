// no-snackbar (standard §4.6): messages go through the one messaging overlay mounted in
// MaterialApp.builder, never ScaffoldMessenger / showSnackBar (a snackbar is lost when a route
// changes and cannot be tested the same way).
'use strict';

const { violation } = require('./lib/context');
const { codeOnly, lineMap } = require('./lib/scan');

const NAME = 'no-snackbar';
const DART_IN_LIB = /^app\/lib\/.+\.dart$/;
const BANNED = /\b(showSnackBar\s*\(|ScaffoldMessenger)/g;

function run(ctx) {
  const found = [];
  for (const file of ctx.list((f) => DART_IN_LIB.test(f))) {
    const code = codeOnly(ctx.read(file), 'dart');
    const lineOf = lineMap(code);
    for (const m of code.matchAll(BANNED)) {
      found.push(
        violation(
          file,
          lineOf(m.index),
          NAME,
          `${m[1].replace(/\s+/g, '')}: use the messaging overlay (standard §4.6), not a snackbar`,
        ),
      );
    }
  }
  return found;
}

module.exports = { name: NAME, run };
