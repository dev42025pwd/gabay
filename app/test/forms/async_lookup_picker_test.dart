import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gabay/l10n/app_localizations.dart';
import 'package:gabay/shared/components/paged_list_notifier.dart';
import 'package:gabay/shared/forms/async_lookup_picker.dart';
import 'package:gabay/shared/forms/debounced_search_field.dart';
import 'package:gabay/shared/forms/field_spec.dart';
import 'package:gabay/shared/forms/select_option.dart';
import 'package:gabay/shared/forms/spec_form_field.dart';

import '../support/forms_harness.dart';
import '../support/shell_harness.dart';

/// The `fk` field: always the async server-search picker (standard 4.10), even
/// for a short list. It searches with the debounce, pages, and shows the value
/// the record holds now even when it is not among the fetched rows or is
/// inactive (DoD item 15: shown and marked, never silently cleared).
void main() {
  late AppLocalizations l10n;
  setUpAll(() async => l10n = await loadEnglish());

  const roles = [
    SelectOption(value: 1, label: 'Mall admin'),
    SelectOption(value: 2, label: 'Venue editor'),
    SelectOption(value: 3, label: 'Viewer'),
    SelectOption(value: 4, label: 'Platform support'),
    SelectOption(value: 5, label: 'Auditor'),
  ];
  const pageSize = 2;

  final formKey = GlobalKey<FormState>();
  late List<(String, int)> calls;
  late List<Object?> changes;
  Future<PageResult<SelectOption>> Function({
    required String search,
    required int page,
  })
  fetcher = _unset;

  setUp(() {
    calls = [];
    changes = [];
    fetcher = ({required search, required page}) async {
      calls.add((search, page));
      final hits = roles
          .where((r) => r.label.toLowerCase().contains(search.toLowerCase()))
          .toList();
      final from = (page - 1) * pageSize;
      return PageResult(
        items: hits.skip(from).take(pageSize).toList(),
        totalCount: hits.length,
        page: page,
        pageSize: pageSize,
      );
    };
  });

  FieldSpec spec({bool required = true, bool readOnly = false}) => testSpec(
    label: 'Role',
    kind: ColKind.fk,
    required: required,
    readOnly: readOnly,
  );

  /// A field whose value the "ViewModel" (a StatefulBuilder) holds and updates.
  Future<void> pump(
    WidgetTester tester, {
    Object? value,
    SelectOption? current,
    FieldSpec? withSpec,
    bool readOnly = false,
    double textScale = 1,
  }) => tester.pumpWidget(
    formHarness(
      textScale: textScale,
      StatefulBuilder(
        builder: (context, setState) => Form(
          key: formKey,
          child: SpecFormField(
            spec: withSpec ?? spec(readOnly: readOnly),
            value: value,
            currentOption: current,
            lookupFetcher: ({required search, required page}) =>
                fetcher(search: search, page: page),
            onChanged: (v) => setState(() {
              changes.add(v);
              value = v;
            }),
          ),
        ),
      ),
    ),
  );

  Future<void> openPicker(WidgetTester tester) async {
    await tester.tap(find.byType(LookupPickerField));
    await tester.pumpAndSettle();
  }

  group('closed', () {
    testWidgets('shows the label and fetches nothing until opened', (
      tester,
    ) async {
      await pump(tester);
      expect(find.text('Role'), findsOneWidget);
      expect(calls, isEmpty);
    });

    testWidgets('has a screen-reader name and acts as a button', (
      tester,
    ) async {
      final handle = tester.ensureSemantics();
      await pump(tester, value: 3, current: roles[2]);
      expect(find.bySemanticsLabel('Role'), findsOneWidget);
      tester.semantics.tap(find.semantics.byLabel('Role'));
      await tester.pumpAndSettle();
      expect(find.text(l10n.pickerSearchLabel), findsOneWidget);
      handle.dispose();
    });

    testWidgets('shows the current choice by its label', (tester) async {
      await pump(tester, value: 3, current: roles[2]);
      expect(find.text('Viewer'), findsOneWidget);
    });

    testWidgets('required with no choice is refused, naming the field', (
      tester,
    ) async {
      await pump(tester);
      expect(formKey.currentState!.validate(), isFalse);
      await tester.pump();
      expect(find.text(l10n.validatorRequired('Role')), findsOneWidget);
    });

    testWidgets('not required with no choice is fine', (tester) async {
      await pump(tester, withSpec: spec(required: false));
      expect(formKey.currentState!.validate(), isTrue);
    });
  });

  // Review (Important): the error text was inside ExcludeSemantics, so a screen
  // reader never heard it. The text field reports it as the hint with an
  // invalid validation state; the picker must too.
  group('screen-reader view of a validation error', () {
    testWidgets('a refused field reports the message and an invalid state', (
      tester,
    ) async {
      final handle = tester.ensureSemantics();
      await pump(tester);
      expect(formKey.currentState!.validate(), isFalse);
      await tester.pump();
      final data = find.semantics
          .byLabel('Role')
          .evaluate()
          .single
          .getSemanticsData();
      expect(data.hint, l10n.validatorRequired('Role'));
      expect(data.validationResult, SemanticsValidationResult.invalid);
      handle.dispose();
    });

    testWidgets('a valid field reports no hint and no validation state', (
      tester,
    ) async {
      final handle = tester.ensureSemantics();
      await pump(tester, value: 3, current: roles[2]);
      expect(formKey.currentState!.validate(), isTrue);
      await tester.pump();
      final data = find.semantics
          .byLabel('Role')
          .evaluate()
          .single
          .getSemanticsData();
      expect(data.hint, isEmpty);
      expect(data.validationResult, SemanticsValidationResult.none);
      handle.dispose();
    });
  });

  testWidgets('an editable fk field without a fetcher is refused at build', (
    tester,
  ) async {
    expect(
      () => SpecFormField(spec: spec(), value: null, onChanged: (_) {}),
      throwsA(
        isA<AssertionError>().having(
          (e) => e.message,
          'message',
          contains('lookupFetcher'),
        ),
      ),
    );
    // Read-only needs no fetcher.
    expect(
      () => SpecFormField(
        spec: spec(readOnly: true),
        value: null,
        onChanged: (_) {},
      ),
      returnsNormally,
    );
  });

  group('the picker', () {
    testWidgets('a fetched row that is inactive is listed, marked inactive', (
      tester,
    ) async {
      fetcher = ({required search, required page}) async => const PageResult(
        items: [
          SelectOption(value: 1, label: 'Mall admin'),
          SelectOption(value: 4, label: 'Platform support', isActive: false),
        ],
        totalCount: 2,
        page: 1,
        pageSize: 25,
      );
      await pump(tester);
      await openPicker(tester);
      expect(find.text('Mall admin'), findsOneWidget);
      expect(
        find.text(l10n.pickerInactive('Platform support')),
        findsOneWidget,
      );
    });

    testWidgets('when only Load more fails, the error says what went wrong', (
      tester,
    ) async {
      final ok = fetcher;
      fetcher = ({required search, required page}) {
        if (page == 2) {
          throw DioException(
            requestOptions: RequestOptions(),
            type: DioExceptionType.connectionError,
          );
        }
        return ok(search: search, page: page);
      };
      await pump(tester);
      await openPicker(tester);
      await tester.tap(find.text(l10n.pickerLoadMore));
      await tester.pumpAndSettle();
      expect(find.text(l10n.errorNoConnection), findsOneWidget);
      expect(find.text('Mall admin'), findsOneWidget, reason: 'rows are kept');
    });

    testWidgets('opens on the first page, with a search box and Load more', (
      tester,
    ) async {
      await pump(tester);
      await openPicker(tester);
      expect(calls, [('', 1)]);
      expect(find.text('Mall admin'), findsOneWidget);
      expect(find.text('Venue editor'), findsOneWidget);
      expect(find.text('Viewer'), findsNothing);
      expect(find.text(l10n.pickerSearchLabel), findsOneWidget);
      expect(find.text(l10n.pickerLoadMore), findsOneWidget);
    });

    testWidgets('Load more asks for the next page and appends it', (
      tester,
    ) async {
      await pump(tester);
      await openPicker(tester);
      await tester.tap(find.text(l10n.pickerLoadMore));
      await tester.pumpAndSettle();
      expect(calls, [('', 1), ('', 2)]);
      expect(find.text('Viewer'), findsOneWidget);
      expect(find.text('Platform support'), findsOneWidget);
    });

    testWidgets('searching waits for the debounce, then asks the server', (
      tester,
    ) async {
      await pump(tester);
      await openPicker(tester);
      await tester.enterText(find.byType(TextField), 'view');
      await tester.pump(kSearchDebounce - const Duration(milliseconds: 1));
      expect(calls, [('', 1)]);
      await tester.pump(const Duration(milliseconds: 1));
      await tester.pumpAndSettle();
      expect(calls.last, ('view', 1));
      expect(find.text('Viewer'), findsOneWidget);
      expect(find.text('Mall admin'), findsNothing);
    });

    testWidgets('no match shows the empty message', (tester) async {
      await pump(tester);
      await openPicker(tester);
      await tester.enterText(find.byType(TextField), 'zzz');
      await tester.pump(kSearchDebounce);
      await tester.pumpAndSettle();
      expect(find.text(l10n.pickerEmpty), findsOneWidget);
    });

    testWidgets('a failed fetch shows the error and a working retry', (
      tester,
    ) async {
      var fail = true;
      final ok = fetcher;
      fetcher = ({required search, required page}) async {
        if (fail) throw StateError('down');
        return ok(search: search, page: page);
      };
      await pump(tester);
      await openPicker(tester);
      expect(find.text(l10n.errorGeneric), findsOneWidget);
      fail = false;
      await tester.tap(find.text(l10n.pickerRetry));
      await tester.pumpAndSettle();
      expect(find.text('Mall admin'), findsOneWidget);
    });

    testWidgets('choosing a row reports its value and the field shows it', (
      tester,
    ) async {
      await pump(tester);
      await openPicker(tester);
      await tester.tap(find.text('Venue editor'));
      await tester.pumpAndSettle();
      expect(changes, [2]);
      expect(find.byType(LookupPickerField), findsOneWidget);
      expect(find.text('Venue editor'), findsOneWidget);
      expect(find.text(l10n.pickerSearchLabel), findsNothing);
      expect(formKey.currentState!.validate(), isTrue);
    });

    testWidgets('closing without a choice changes nothing', (tester) async {
      await pump(tester, value: 3, current: roles[2]);
      await openPicker(tester);
      await tester.tap(find.byType(CloseButton));
      await tester.pumpAndSettle();
      expect(changes, isEmpty);
      expect(find.text('Viewer'), findsOneWidget);
    });

    testWidgets('the loading spinner has a screen-reader name', (tester) async {
      final handle = tester.ensureSemantics();
      final never = Future<PageResult<SelectOption>>.delayed(
        const Duration(hours: 1),
        () => const PageResult(
          items: [],
          totalCount: 0,
          page: 1,
          pageSize: pageSize,
        ),
      );
      fetcher = ({required search, required page}) => never;
      await pump(tester);
      await tester.tap(find.byType(LookupPickerField));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.bySemanticsLabel(l10n.loadingLabel), findsOneWidget);
      handle.dispose();
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(hours: 1));
    });
  });

  // DoD item 15 (FEATURE_PIPELINE 5): deactivate a referenced row, open the
  // historical record, save it, and the value survives.
  group('the value the record holds now', () {
    const support = SelectOption(
      value: 4,
      label: 'Platform support',
      isActive: false,
    );

    testWidgets('is shown even when the fetched rows do not contain it', (
      tester,
    ) async {
      // Row 5 is on page 3 of the lookup; page 1 (rows 1 and 2) is all that
      // would ever be fetched, and the field still names the held value.
      await pump(tester, value: 5, current: roles[4]);
      expect(find.text('Auditor'), findsOneWidget);
      expect(calls, isEmpty);
      await openPicker(tester);
      expect(calls, [('', 1)]);
    });

    testWidgets('an inactive one is marked inactive', (tester) async {
      await pump(tester, value: 4, current: support);
      expect(
        find.text(l10n.pickerInactive('Platform support')),
        findsOneWidget,
      );
    });

    testWidgets('an inactive one still satisfies required, unchanged', (
      tester,
    ) async {
      await pump(tester, value: 4, current: support);
      expect(formKey.currentState!.validate(), isTrue);
      expect(changes, isEmpty, reason: 'nothing cleared it');
    });

    testWidgets('opening and closing the picker does not clear it', (
      tester,
    ) async {
      await pump(tester, value: 4, current: support);
      await openPicker(tester);
      await tester.tap(find.byType(CloseButton));
      await tester.pumpAndSettle();
      expect(changes, isEmpty);
      expect(
        find.text(l10n.pickerInactive('Platform support')),
        findsOneWidget,
      );
      expect(formKey.currentState!.validate(), isTrue);
    });

    testWidgets('a held value with no label to show falls back to the value', (
      tester,
    ) async {
      await pump(tester, value: 99);
      expect(find.text('99'), findsOneWidget);
      expect(formKey.currentState!.validate(), isTrue);
    });

    testWidgets('choosing another row replaces it', (tester) async {
      await pump(tester, value: 4, current: support);
      await openPicker(tester);
      await tester.tap(find.text('Mall admin'));
      await tester.pumpAndSettle();
      expect(changes, [1]);
      expect(find.text('Mall admin'), findsOneWidget);
      expect(find.text(l10n.pickerInactive('Platform support')), findsNothing);
    });
  });

  group('read-only', () {
    testWidgets('shows the label of the value, builds no picker', (
      tester,
    ) async {
      await pump(tester, value: 3, current: roles[2], readOnly: true);
      expect(find.byType(LookupPickerField), findsNothing);
      expect(find.text('Viewer'), findsOneWidget);
    });

    testWidgets('marks an inactive value', (tester) async {
      await pump(
        tester,
        value: 4,
        current: const SelectOption(
          value: 4,
          label: 'Platform support',
          isActive: false,
        ),
        readOnly: true,
      );
      expect(
        find.text(l10n.pickerInactive('Platform support')),
        findsOneWidget,
      );
    });
  });

  testWidgets('nothing overflows at text size x1.4 on a 320 px phone', (
    tester,
  ) async {
    setLogicalSize(tester, const Size(320, 640));
    await pump(
      tester,
      value: 4,
      current: const SelectOption(
        value: 4,
        label: 'A very long role name that has to fit the row somehow',
        isActive: false,
      ),
      textScale: 1.4,
    );
    await openPicker(tester);
    expect(tester.takeException(), isNull);
  });
}

Future<PageResult<SelectOption>> _unset({
  required String search,
  required int page,
}) => throw StateError('fetcher not set');
