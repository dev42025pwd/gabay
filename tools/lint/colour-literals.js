// colour-literals (rule 6, standard §4.7): colour literals live only in the theme-token file.
// Everywhere else in app/lib use Theme.of(context).colorScheme.* or the GabayTokens extension.
// Comments and strings are ignored; only code is searched (a Dart ${...} interpolation is code).
//
// Caught: Color(0x..) and Color(0X..), any Color.from*( constructor, any <prefix>Colors.<name>
// (Colors, CupertinoColors, m.Colors), and primaryColor wherever it appears (including
// ThemeData(primaryColor: ..)). Documented limits, not caught: Color(<decimal integer>), a colour
// built from a const int, HSLColor, and the other ThemeData legacy colours.
'use strict';

const { violation } = require('./lib/context');
const { codeOnly, lineMap } = require('./lib/scan');

const NAME = 'colour-literals';
const TOKENS_FILE = 'app/lib/core/theme/gabay_tokens.dart';
const DART_IN_LIB = /^app\/lib\/.+\.dart$/;

const PATTERNS = [
  [/\bColor\s*\(\s*0[xX]/g, 'Color(0x...)'],
  [/\bColor\s*\.\s*from\w*\s*\(/g, 'Color.from...('],
  [/\b\w*Colors\s*\.\s*\w+/g, 'Colors.<name>'],
  [/\bprimaryColor\b/g, 'primaryColor'],
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
