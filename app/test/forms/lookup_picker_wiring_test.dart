import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gabay/core/network/api_client.dart';
import 'package:gabay/l10n/app_localizations.dart';
import 'package:gabay/shared/forms/async_lookup_picker.dart';
import 'package:gabay/shared/forms/field_spec.dart';
import 'package:gabay/shared/forms/lookup_names.dart';
import 'package:gabay/shared/forms/lookup_service.dart';
import 'package:gabay/shared/forms/select_option.dart';
import 'package:gabay/shared/forms/spec_form_field.dart';

import '../support/forms_harness.dart';
import '../support/shell_harness.dart';

/// FF-0 (plan/FF0-dev-stub-lookups.md section 5, client): S9's picker wired to
/// the real `LookupService`, over a fake transport that answers as the route
/// does. DoD item 15 for the client half: a held value whose row was switched
/// off is shown marked inactive (through `lookupOption`) and survives opening
/// the picker. The end-to-end case waits for FF-1 (L155).

/// A tiny stand-in for the route: three active rows, one inactive row (id 4),
/// served by page and search, and the single-row read.
class _FakeLookupApi implements HttpClientAdapter {
  static const rows = [
    (1, 'Main building', true),
    (2, 'Annex', true),
    (3, 'Parking', true),
    (4, 'Old wing', false),
  ];

  /// When set, every request fails with this status and error text.
  (int, String)? failWith;
  final List<Uri> requests = [];

  Map<String, Object?> _json((int, String, bool) r) => {
    'id': r.$1,
    'code': 'C${r.$1}',
    'label': r.$2,
    'isActive': r.$3,
  };

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options.uri);
    final (int, Object?) reply;
    final fail = failWith;
    if (fail != null) {
      reply = (fail.$1, {'error': fail.$2});
    } else if (options.uri.pathSegments.length == 4) {
      final id = int.parse(options.uri.pathSegments.last);
      reply = (200, _json(rows.firstWhere((r) => r.$1 == id)));
    } else {
      final search = (options.uri.queryParameters['search'] ?? '')
          .toLowerCase();
      final hits = rows
          .where((r) => r.$3 && r.$2.toLowerCase().contains(search))
          .map(_json)
          .toList();
      reply = (
        200,
        {'items': hits, 'totalCount': hits.length, 'page': 1, 'pageSize': 25},
      );
    }
    return ResponseBody.fromString(
      jsonEncode(reply.$2),
      reply.$1,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  late AppLocalizations l10n;
  setUpAll(() async => l10n = await loadEnglish());

  late _FakeLookupApi api;
  late LookupService service;
  final formKey = GlobalKey<FormState>();
  late List<Object?> changes;

  setUp(() {
    api = _FakeLookupApi();
    service = LookupService(
      ApiClient(
        baseUrl: 'http://api.test.invalid',
        adapter: api,
        debugLogging: false,
      ),
    );
    changes = [];
  });

  FieldSpec spec() => testSpec(label: 'Building type', kind: ColKind.fk);

  Future<void> pump(
    WidgetTester tester, {
    Object? value,
    SelectOption? current,
    double textScale = 1,
  }) => tester.pumpWidget(
    formHarness(
      textScale: textScale,
      StatefulBuilder(
        builder: (context, setState) => Form(
          key: formKey,
          child: SpecFormField(
            spec: spec(),
            value: value,
            currentOption: current,
            lookupFetcher: service.lookupFetcher(LookupName.buildingTypes),
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

  testWidgets('the picker lists the active rows the route returns', (
    tester,
  ) async {
    await pump(tester);
    await openPicker(tester);
    expect(find.text('Main building'), findsOneWidget);
    expect(find.text('Annex'), findsOneWidget);
    expect(find.text('Parking'), findsOneWidget);
    expect(find.textContaining('Old wing'), findsNothing);
    expect(api.requests.single.path, '/api/lookups/building-types');
  });

  testWidgets('choosing a row reports its id', (tester) async {
    await pump(tester);
    await openPicker(tester);
    await tester.tap(find.text('Annex'));
    await tester.pumpAndSettle();
    expect(changes, [2]);
    expect(find.text('Annex'), findsOneWidget);
  });

  testWidgets('searching asks the route, not the list in memory', (
    tester,
  ) async {
    await pump(tester);
    await openPicker(tester);
    await tester.enterText(find.byType(TextField), 'park');
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    expect(api.requests.last.queryParameters['search'], 'park');
    expect(find.text('Parking'), findsOneWidget);
    expect(find.text('Annex'), findsNothing);
  });

  group('a held value whose row was switched off', () {
    testWidgets('shows inactive, with its label from lookupOption', (
      tester,
    ) async {
      final current = await tester.runAsync(
        () => service.lookupOption(LookupName.buildingTypes, 4),
      );
      expect(api.requests.single.path, '/api/lookups/building-types/4');
      await pump(tester, value: 4, current: current);
      expect(find.text(l10n.pickerInactive('Old wing')), findsOneWidget);
    });

    testWidgets('still satisfies required, and opening the picker keeps it', (
      tester,
    ) async {
      final current = await tester.runAsync(
        () => service.lookupOption(LookupName.buildingTypes, 4),
      );
      await pump(tester, value: 4, current: current);
      expect(formKey.currentState!.validate(), isTrue);

      await openPicker(tester);
      // The list offers only active rows; the held one is not among them.
      expect(find.text('Main building'), findsOneWidget);
      await tester.tap(find.byType(CloseButton));
      await tester.pumpAndSettle();

      expect(changes, isEmpty, reason: 'nothing cleared it');
      expect(find.text(l10n.pickerInactive('Old wing')), findsOneWidget);
      expect(formKey.currentState!.validate(), isTrue);
    });

    testWidgets('an active held value shows its plain label', (tester) async {
      final current = await tester.runAsync(
        () => service.lookupOption(LookupName.buildingTypes, 1),
      );
      await pump(tester, value: 1, current: current);
      expect(find.text('Main building'), findsOneWidget);
    });
  });

  testWidgets('a route error shows its message with a working retry', (
    tester,
  ) async {
    api.failWith = (503, 'Database unavailable');
    await pump(tester);
    await openPicker(tester);
    expect(find.text('Database unavailable'), findsOneWidget);

    api.failWith = null;
    await tester.tap(find.text(l10n.pickerRetry));
    await tester.pumpAndSettle();
    expect(find.text('Main building'), findsOneWidget);
  });

  testWidgets('nothing overflows at text size x1.4 on a 320 px phone', (
    tester,
  ) async {
    setLogicalSize(tester, const Size(320, 640));
    final current = await tester.runAsync(
      () => service.lookupOption(LookupName.buildingTypes, 4),
    );
    await pump(tester, value: 4, current: current, textScale: 1.4);
    await openPicker(tester);
    expect(tester.takeException(), isNull);
  });
}
