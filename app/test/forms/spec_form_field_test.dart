import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gabay/l10n/app_localizations.dart';
import 'package:gabay/shared/forms/field_spec.dart';
import 'package:gabay/shared/forms/select_option.dart';
import 'package:gabay/shared/forms/spec_form_field.dart';

import '../support/forms_harness.dart';
import '../support/shell_harness.dart';

/// The resolver: one FieldSpec in, one widget (and its validators) out.
void main() {
  late AppLocalizations l10n;
  setUpAll(() async => l10n = await loadEnglish());

  final formKey = GlobalKey<FormState>();
  const roles = [
    SelectOption(value: 1, label: 'Mall admin'),
    SelectOption(value: 2, label: 'Viewer'),
  ];

  Future<void> pump(
    WidgetTester tester,
    FieldSpec spec, {
    Object? value,
    ValueChanged<Object?>? onChanged,
    List<SelectOption> options = const [],
    double textScale = 1,
  }) => tester.pumpWidget(
    formHarness(
      textScale: textScale,
      Form(
        key: formKey,
        child: SpecFormField(
          spec: spec,
          value: value,
          onChanged: onChanged ?? (_) {},
          options: options,
        ),
      ),
    ),
  );

  group('text', () {
    testWidgets('shows the label and reports what is typed', (tester) async {
      Object? got;
      await pump(tester, testSpec(), onChanged: (v) => got = v);
      expect(find.text('Venue name'), findsOneWidget);
      await tester.enterText(find.byType(TextFormField), 'Aurora');
      expect(got, 'Aurora');
    });

    testWidgets('starts from the given value', (tester) async {
      await pump(tester, testSpec(), value: 'Bayview');
      expect(find.text('Bayview'), findsOneWidget);
    });

    testWidgets('has a screen-reader name', (tester) async {
      final handle = tester.ensureSemantics();
      await pump(tester, testSpec());
      expect(find.bySemanticsLabel('Venue name'), findsOneWidget);
      handle.dispose();
    });
  });

  group('email', () {
    final spec = testSpec(label: 'Email', format: FieldFormat.email);

    testWidgets('uses the email keyboard', (tester) async {
      await pump(tester, spec);
      final field = tester.widget<TextField>(find.byType(TextField));
      expect(field.keyboardType, TextInputType.emailAddress);
    });

    testWidgets('refuses a value that is not an email, naming the field', (
      tester,
    ) async {
      await pump(tester, spec, value: 'not-an-email');
      expect(formKey.currentState!.validate(), isFalse);
      await tester.pump();
      expect(find.text(l10n.validatorNotEmail('Email')), findsOneWidget);
    });

    testWidgets('accepts an email, and a blank when not required', (
      tester,
    ) async {
      await pump(tester, spec, value: 'ana@example.com');
      expect(formKey.currentState!.validate(), isTrue);
      await pump(tester, spec, value: '');
      expect(formKey.currentState!.validate(), isTrue);
    });
  });

  group('integer', () {
    final spec = testSpec(label: 'Floor', kind: ColKind.integer);

    testWidgets('uses the number keyboard and reports an int', (tester) async {
      Object? got;
      await pump(tester, spec, onChanged: (v) => got = v);
      final field = tester.widget<TextField>(find.byType(TextField));
      expect(field.keyboardType.index, TextInputType.number.index);
      await tester.enterText(find.byType(TextFormField), '12');
      expect(got, 12);
    });

    testWidgets('letters never get in; blank reports null, never throws', (
      tester,
    ) async {
      Object? got = 'unset';
      await pump(tester, spec, onChanged: (v) => got = v);
      await tester.enterText(find.byType(TextFormField), '1a2b');
      expect(got, 12);
      await tester.enterText(find.byType(TextFormField), '');
      expect(got, isNull);
    });

    testWidgets('a lone minus sign is refused, naming the field', (
      tester,
    ) async {
      await pump(tester, spec, value: 5);
      await tester.enterText(find.byType(TextFormField), '-');
      expect(formKey.currentState!.validate(), isFalse);
      await tester.pump();
      expect(find.text(l10n.validatorNotInteger('Floor')), findsOneWidget);
    });
  });

  group('flag', () {
    final spec = testSpec(label: 'Active', kind: ColKind.flag);

    testWidgets('is a switch, never a dropdown, and reports both states', (
      tester,
    ) async {
      final seen = <Object?>[];
      await pump(tester, spec, value: false, onChanged: seen.add);
      expect(find.byType(DropdownButtonFormField<Object>), findsNothing);
      expect(find.byType(Switch), findsOneWidget);
      await tester.tap(find.byType(Switch));
      expect(seen, [true]);
    });

    testWidgets('an absent value is off, and the switch has a name', (
      tester,
    ) async {
      final handle = tester.ensureSemantics();
      await pump(tester, spec);
      expect(tester.widget<Switch>(find.byType(Switch)).value, isFalse);
      expect(find.bySemanticsLabel('Active'), findsOneWidget);
      handle.dispose();
    });
  });

  group('select (fk)', () {
    final spec = testSpec(label: 'Role', kind: ColKind.fk, required: true);

    testWidgets('offers the options passed in and reports the chosen value', (
      tester,
    ) async {
      Object? got;
      await pump(tester, spec, options: roles, onChanged: (v) => got = v);
      await tester.tap(find.byType(DropdownButtonFormField<Object>));
      await tester.pumpAndSettle();
      expect(find.text('Mall admin'), findsOneWidget);
      await tester.tap(find.text('Viewer').last);
      await tester.pumpAndSettle();
      expect(got, 2);
    });

    testWidgets('shows the current choice', (tester) async {
      await pump(tester, spec, options: roles, value: 1);
      expect(find.text('Mall admin'), findsOneWidget);
    });

    testWidgets('required: no choice is refused, naming the field', (
      tester,
    ) async {
      await pump(tester, spec, options: roles);
      expect(formKey.currentState!.validate(), isFalse);
      await tester.pump();
      expect(find.text(l10n.validatorRequired('Role')), findsOneWidget);
    });

    testWidgets('a value missing from the options does not crash', (
      tester,
    ) async {
      await pump(tester, spec, options: roles, value: 99);
      expect(tester.takeException(), isNull);
    });
  });

  group('derived validators', () {
    testWidgets(
      'required mirrors NOT NULL: blank is refused, naming the field',
      (tester) async {
        await pump(tester, testSpec(required: true), value: '   ');
        expect(formKey.currentState!.validate(), isFalse);
        await tester.pump();
        expect(find.text(l10n.validatorRequired('Venue name')), findsOneWidget);
      },
    );

    testWidgets('not required: blank is fine', (tester) async {
      await pump(tester, testSpec());
      expect(formKey.currentState!.validate(), isTrue);
    });

    testWidgets('maxLength mirrors the column: one over is refused', (
      tester,
    ) async {
      await pump(tester, testSpec(maxLength: 5), value: 'abcdef');
      expect(formKey.currentState!.validate(), isFalse);
      await tester.pump();
      expect(find.text(l10n.validatorTooLong('Venue name', 5)), findsOneWidget);
    });

    testWidgets('maxLength: the limit itself is accepted', (tester) async {
      await pump(tester, testSpec(maxLength: 5), value: 'abcde');
      expect(formKey.currentState!.validate(), isTrue);
    });

    testWidgets('required runs before maxLength', (tester) async {
      await pump(tester, testSpec(required: true, maxLength: 5), value: '');
      expect(formKey.currentState!.validate(), isFalse);
      await tester.pump();
      expect(find.text(l10n.validatorRequired('Venue name')), findsOneWidget);
    });
  });

  group('read-only', () {
    testWidgets('text: shows label and value, builds no input', (tester) async {
      await pump(
        tester,
        testSpec(readOnly: true, required: true),
        value: 'Aurora',
      );
      expect(find.byType(TextFormField), findsNothing);
      expect(find.text('Aurora'), findsOneWidget);
      expect(find.text('Venue name'), findsOneWidget);
      expect(
        formKey.currentState!.validate(),
        isTrue,
        reason: 'a read-only field is never validated',
      );
    });

    testWidgets('flag: a switch that cannot be toggled', (tester) async {
      final seen = <Object?>[];
      await pump(
        tester,
        testSpec(kind: ColKind.flag, readOnly: true),
        value: true,
        onChanged: seen.add,
      );
      expect(tester.widget<Switch>(find.byType(Switch)).onChanged, isNull);
      await tester.tap(find.byType(Switch), warnIfMissed: false);
      expect(seen, isEmpty);
    });

    testWidgets('select: shows the option label, builds no dropdown', (
      tester,
    ) async {
      await pump(
        tester,
        testSpec(kind: ColKind.fk, readOnly: true),
        options: roles,
        value: 2,
      );
      expect(find.byType(DropdownButtonFormField<Object>), findsNothing);
      expect(find.text('Viewer'), findsOneWidget);
    });

    testWidgets('has a screen-reader name', (tester) async {
      final handle = tester.ensureSemantics();
      await pump(tester, testSpec(readOnly: true), value: 'Aurora');
      expect(find.bySemanticsLabel('Venue name'), findsOneWidget);
      handle.dispose();
    });
  });

  group('layout', () {
    for (final kind in ColKind.values) {
      testWidgets(
        '$kind does not overflow at text size x1.4 on a 320 px phone',
        (tester) async {
          setLogicalSize(tester, const Size(320, 640));
          await pump(
            tester,
            testSpec(
              label: 'A rather long field name that must wrap or ellipsize',
              kind: kind,
            ),
            options: const [
              SelectOption(
                value: 1,
                label: 'A very long option label that also has to fit the row',
              ),
            ],
            value: kind == ColKind.fk ? 1 : null,
            textScale: 1.4,
          );
          expect(tester.takeException(), isNull);
        },
      );
    }
  });
}
