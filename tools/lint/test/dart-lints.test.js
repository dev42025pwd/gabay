// no-bare-textfield, colour-literals and no-snackbar: the three text-pattern linters for Dart.
'use strict';

const test = require('../../test/timeout');
const assert = require('node:assert/strict');
const { lint, at } = require('./helper');

const VIEW = 'app/lib/features/demo/views/demo_view.dart';

// ---- no-bare-textfield (rule 7; widened to all of app/lib except shared/forms, L128) ------------

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

test('no-bare-textfield (I4): it applies to every file under app/lib, not only features/**/views/', () => {
  const bad = 'Widget w() => TextFormField();\n';
  for (const file of [
    'app/lib/features/venue/view/singular.dart',
    'app/lib/features/venue/widgets/w.dart',
    'app/lib/shared/widgets/w.dart',
    'app/lib/core/x.dart',
    'app/lib/main_admin.dart',
  ]) {
    assert.deepEqual(
      at(lint('no-bare-textfield', { [file]: bad })),
      [`${file}:1:no-bare-textfield`],
      file,
    );
  }
  assert.deepEqual(
    lint('no-bare-textfield', { 'app/test/x_test.dart': bad }),
    [],
    'tests are not app/lib',
  );
});

test('no-bare-textfield (I4): CupertinoTextField, an import prefix, .new and a typedef alias are caught', () => {
  const dart = `final a = CupertinoTextField();
final b = m.TextFormField();
final c = TextFormField.new;
typedef Field = TextFormField;
typedef Other = m.TextField;
final d = TextField  (
);
`;
  assert.deepEqual(
    at(lint('no-bare-textfield', { [VIEW]: dart })).map((s) => s.split(':')[1]),
    ['1', '2', '3', '4', '5', '6'],
  );
});

test('no-bare-textfield: shared/forms (where FieldSpec builds fields), comments, strings and AppTextField pass', () => {
  const widget = 'Widget f() => TextFormField(controller: c);\ntypedef F = TextField;\n';
  const harmless = `// TextFormField( is built in shared/forms
final s = 'TextField(';
Widget a() => AppTextField(spec: f);
final t = TextField;
`;
  assert.deepEqual(
    lint('no-bare-textfield', { 'app/lib/shared/forms/field_builder.dart': widget }),
    [],
  );
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
    [
      '1:colour-literals',
      '2:colour-literals',
      '3:colour-literals',
      '4:colour-literals',
      '5:colour-literals',
      '6:colour-literals',
    ],
  );
});

test('colour-literals (I3): Color.from*, 0X hex, CupertinoColors, prefixed Colors, primaryColor anywhere and ${Colors.x} fail', () => {
  const cases = [
    [
      'Color.from(alpha: 1, red: 0, green: 0, blue: 0)',
      'const a = Color.from(alpha: 1, red: 0, green: 0, blue: 0);',
    ],
    ['Color.fromARGB', 'final a = Color.fromARGB(1, 2, 3, 4);'],
    ['0X hex', 'const a = Color(0XFF000000);'],
    ['CupertinoColors', 'final a = CupertinoColors.black;'],
    ['prefixed Colors', "import 'package:flutter/material.dart' as m;\nfinal a = m.Colors.black;"],
    ['ThemeData(primaryColor:', 'final t = ThemeData(primaryColor: kBrand);'],
    ['interpolated Colors', "final s = Text('${Colors.black}');"],
  ];
  for (const [name, dart] of cases) {
    const found = lint('colour-literals', { [VIEW]: dart });
    const line = dart.split('\n').length;
    assert.deepEqual(at(found), [`${VIEW}:${line}:colour-literals`], name);
  }
});

test('colour-literals (I3): documented limits pass: Color(<decimal>), HSLColor, const ints, primaryColorLight', () => {
  const dart = `const kBlack = 0xFF000000;
final a = Color(kBlack);
final b = Color(4278190080);
final c = HSLColor.fromAHSL(1, 0, 0, 0).toColor();
final d = theme.primaryColorLight;
`;
  assert.deepEqual(lint('colour-literals', { [VIEW]: dart }), []);
});

test('colour-literals: the gate sample, Colors.black in a view, fails', () => {
  const found = lint('colour-literals', {
    [VIEW]: 'Widget w() {\n  return Container(color: Colors.black);\n}\n',
  });
  assert.deepEqual(at(found), [`${VIEW}:2:colour-literals`]);
});

test('colour-literals: the tokens file, comments, strings, colorScheme and code outside lib/ pass', () => {
  const tokens =
    'const seed = Color(0xFFC1623D);\nfinal w = Colors.white;\nfinal t = ThemeData(primaryColor: x);\n';
  const clean = `// Colors.black and Color(0xFF000000) are forbidden here
/* final x = Colors.red; */
final s = 'Colors.red';
final ok = Theme.of(context).colorScheme.primary;
`;
  assert.deepEqual(lint('colour-literals', { 'app/lib/core/theme/gabay_tokens.dart': tokens }), []);
  assert.deepEqual(lint('colour-literals', { [VIEW]: clean }), []);
  assert.deepEqual(
    lint('colour-literals', { 'app/test/theme_test.dart': 'final a = Colors.red;\n' }),
    [],
  );
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
