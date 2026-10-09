import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gabay/l10n/app_localizations.dart';
import 'package:gabay/shared/components/paged_list_notifier.dart';
import 'package:gabay/shared/forms/async_lookup_picker.dart';
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
  const viewer = SelectOption(value: 2, label: 'Viewer');

  Future<void> pump(
    WidgetTester tester,
    FieldSpec spec, {
    Object? value,
    ValueChanged<Object?>? onChanged,
    SelectOption? current,
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
          currentOption: current,
          lookupFetcher: ({required search, required page}) async =>
              const PageResult(items: [], totalCount: 0, page: 1, pageSize: 25),
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

  // Review finding 8: a field built once must follow a later value from the
  // ViewModel (a form reset, a record loaded after the first frame).
  group('follows later value changes', () {
    testWidgets('text shows a new value', (tester) async {
      await pump(tester, testSpec(), value: 'Aurora');
      expect(find.text('Aurora'), findsOneWidget);
      await pump(tester, testSpec(), value: 'Bayview');
      expect(find.text('Bayview'), findsOneWidget);
      expect(find.text('Aurora'), findsNothing);
    });

    testWidgets('text clears when the value is reset to null', (tester) async {
      await pump(tester, testSpec(), value: 'Aurora');
      await pump(tester, testSpec());
      expect(find.text('Aurora'), findsNothing);
    });

    testWidgets('typing is not undone when the ViewModel echoes it back', (
      tester,
    ) async {
      var value = '';
      late StateSetter rebuild;
      await tester.pumpWidget(
        formHarness(
          StatefulBuilder(
            builder: (context, setState) {
              rebuild = setState;
              return SpecFormField(
                spec: testSpec(),
                value: value,
                onChanged: (v) => rebuild(() => value = v! as String),
              );
            },
          ),
        ),
      );
      await tester.enterText(find.byType(TextFormField), 'Aur');
      await tester.pump();
      expect(find.text('Aur'), findsOneWidget);
      expect(value, 'Aur');
    });

    testWidgets('integer shows a new value', (tester) async {
      final spec = testSpec(label: 'Floor', kind: ColKind.integer);
      await pump(tester, spec, value: 3);
      expect(find.text('3'), findsOneWidget);
      await pump(tester, spec, value: 7);
      expect(find.text('7'), findsOneWidget);
    });

    // DESIGN CHOICE (finding 6): an editable integer keeps what the user typed
    // while the value it reports is null, and shows the validator's message.
    testWidgets(
      'integer keeps a half-typed minus sign while the value is null',
      (tester) async {
        final spec = testSpec(label: 'Floor', kind: ColKind.integer);
        await pump(tester, spec, value: 5);
        await tester.enterText(find.byType(TextFormField), '-');
        await pump(tester, spec); // the ViewModel now holds null
        expect(find.text('-'), findsOneWidget, reason: 'the text is kept');
        expect(formKey.currentState!.validate(), isFalse);
        await tester.pump();
        expect(find.text(l10n.validatorNotInteger('Floor')), findsOneWidget);
      },
    );
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

    testWidgets('select: shows the option label, builds no picker', (
      tester,
    ) async {
      await pump(
        tester,
        testSpec(kind: ColKind.fk, readOnly: true),
        current: viewer,
        value: 2,
      );
      expect(find.byType(LookupPickerField), findsNothing);
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
            current: const SelectOption(
              value: 1,
              label: 'A very long option label that also has to fit the row',
            ),
            value: kind == ColKind.fk ? 1 : null,
            textScale: 1.4,
          );
          expect(tester.takeException(), isNull);
        },
      );
    }
  });
}
