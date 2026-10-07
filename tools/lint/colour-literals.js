// colour-literals (rule 6, standard §4.7): colour literals live only in the theme-token file.
// Everywhere else use Theme.of(context).colorScheme.* or the GabayTokens extension. Comments and
// strings are ignored; only code is searched.
'use strict';

const { violation } = require('./lib/context');
const { codeOnly, lineMap } = require('./lib/scan');

const NAME = 'colour-literals';
const TOKENS_FILE = 'app/lib/core/theme/gabay_tokens.dart';
const DART_IN_LIB = /^app\/lib\/.+\.dart$/;

const PATTERNS = [
  [/\bColor\s*\(\s*0x/g, 'Color(0x...)'],
  [/\bColor\s*\.\s*fromARGB\s*\(/g, 'Color.fromARGB('],
  [/\bColor\s*\.\s*fromRGBO\s*\(/g, 'Color.fromRGBO('],
  [/(?<![\w.])Colors\s*\.\s*\w+/g, 'Colors.<name>'],
  [/\.\s*primaryColor\b/g, '.primaryColor'],
];

function run(ctx) {
  const found = [];
  for (const file of ctx.list((f) => DART_IN_LIB.test(f) && f !== TOKENS_FILE)) {
    const code = codeOnly(ctx.read(file), 'dart');
    const lineOf = lineMap(code);
    for (const [pattern, label] of PATTERNS) {
      for (const m of code.matchAll(pattern)) {
        found.push(
          violation(
            file,
            lineOf(m.index),
            NAME,
            `${label}: colours belong in ${TOKENS_FILE}; use Theme.of(context).colorScheme.* (rule 6)`,
          ),
        );
      }
    }
  }
  return found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

module.exports = { name: NAME, run };
