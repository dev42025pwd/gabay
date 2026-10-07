// no-bare-textfield, colour-literals and no-snackbar: the three text-pattern linters for Dart.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { lint, at } = require('./helper');

const VIEW = 'app/lib/features/demo/views/demo_view.dart';

// ---- no-bare-textfield (rule 7) ----------------------------------------------------------------

test('no-bare-textfield: TextFormField( and TextField( in a view fail, each on its own line', () => {
  const dart = `import 'package:flutter/material.dart';
Widget build() {
  return Column(children: [
    TextFormField(decoration: x),
    const TextField(),
  ]);
}
`;
  assert.deepEqual(at(lint('no-bare-textfield', { [VIEW]: dart })), [
    `${VIEW}:4:no-bare-textfield`,
    `${VIEW}:5:no-bare-textfield`,
  ]);
});

test('no-bare-textfield: allowed in shared/forms, ignored in comments, strings and AppTextField', () => {
  const widget = 'Widget f() => TextFormField(controller: c);\n';
  const harmless = `// TextFormField( is built in shared/forms
final s = 'TextField(';
Widget a() => AppTextField(spec: f);
`;
  assert.deepEqual(lint('no-bare-textfield', { 'app/lib/shared/forms/field_builder.dart': widget }), []);
  assert.deepEqual(lint('no-bare-textfield', { [VIEW]: harmless }), []);
});

// ---- colour-literals (rule 6) ------------------------------------------------------------------

test('colour-literals: every banned form fails on its line', () => {
  const dart = `final a = Color(0xFF112233);
final b = Color.fromARGB(255, 1, 2, 3);
final c = Color.fromRGBO(1, 2, 3, 1);
final d = Colors.black;
final e = Theme.of(context).primaryColor;
final f = Colors.grey.shade200;
`;
  const found = lint('colour-literals', { 'app/lib/features/demo/views/a.dart': dart });
  assert.deepEqual(
    at(found).map((s) => s.split(':').slice(1).join(':')),
    ['1:colour-literals', '2:colour-literals', '3:colour-literals', '4:colour-literals', '5:colour-literals', '6:colour-literals'],
  );
});

test('colour-literals: the gate sample, Colors.black in a view, fails', () => {
  const found = lint('colour-literals', { [VIEW]: 'Widget w() {\n  return Container(color: Colors.black);\n}\n' });
  assert.deepEqual(at(found), [`${VIEW}:2:colour-literals`]);
});

test('colour-literals: the tokens file, comments, strings, colorScheme and code outside lib/ pass', () => {
  const tokens = 'const seed = Color(0xFFC1623D);\nfinal w = Colors.white;\n';
  const clean = `// Colors.black and Color(0xFF000000) are forbidden here
/* final x = Colors.red; */
final s = 'Colors.red';
final ok = Theme.of(context).colorScheme.primary;
final mine = MyColors.black;
`;
  assert.deepEqual(lint('colour-literals', { 'app/lib/core/theme/gabay_tokens.dart': tokens }), []);
  assert.deepEqual(lint('colour-literals', { [VIEW]: clean }), []);
  assert.deepEqual(lint('colour-literals', { 'app/test/theme_test.dart': 'final a = Colors.red;\n' }), []);
});

test('colour-literals: generated l10n code and build output are skipped', () => {
  assert.deepEqual(
    lint('colour-literals', {
      'app/lib/l10n/app_localizations.dart': 'final a = Colors.red;\n',
      'app/build/x/y.dart': 'final a = Colors.red;\n',
    }),
    [],
  );
});

// ---- no-snackbar (§4.6) ------------------------------------------------------------------------

test('no-snackbar: showSnackBar( and ScaffoldMessenger fail on their lines', () => {
  const dart = `void f(BuildContext context) {
  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('x')));
}
final m = ScaffoldMessenger;
`;
  const found = lint('no-snackbar', { 'app/lib/shared/x.dart': dart });
  assert.deepEqual(at(found), [
    'app/lib/shared/x.dart:2:no-snackbar',
    'app/lib/shared/x.dart:2:no-snackbar',
    'app/lib/shared/x.dart:4:no-snackbar',
  ]);
});

test('no-snackbar: the messaging overlay and mentions in comments or strings pass', () => {
  const dart = `// never use showSnackBar( or ScaffoldMessenger here
final s = 'showSnackBar(';
void f(WidgetRef ref) => ref.read(messageProvider.notifier).show(msg);
`;
  assert.deepEqual(lint('no-snackbar', { 'app/lib/shared/x.dart': dart }), []);
});
