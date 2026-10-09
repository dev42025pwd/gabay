import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gabay/core/network/api_client.dart';
import 'package:gabay/core/network/api_error.dart';
import 'package:gabay/l10n/app_localizations.dart';
import 'package:gabay/shared/forms/async_lookup_picker.dart';
import 'package:gabay/shared/forms/lookup_names.dart';
import 'package:gabay/shared/forms/lookup_service.dart';
import 'package:gabay/shared/forms/select_option.dart';

import '../support/shell_harness.dart';

/// FF-0 (plan/FF0-dev-stub-lookups.md section 5, client): the fetcher and
/// `lookupOption` over `ApiClient`, against the server contract of
/// `GET /api/lookups/:name` and `GET /api/lookups/:name/:id`. The transport is
/// a fake: no network and no server branch is touched.

typedef _Reply = (int, Object?) Function(RequestOptions options);

/// Answers each request through [reply]; records every request.
class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this.reply);

  final _Reply reply;
  final List<RequestOptions> requests = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final (status, body) = reply(options);
    return ResponseBody.fromString(
      body is String ? body : jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: [
          body is String
              ? Headers.textPlainContentType
              : Headers.jsonContentType,
        ],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

class _ConnectionFailureAdapter implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) => Future.error(
    DioException(
      requestOptions: options,
      type: DioExceptionType.connectionError,
    ),
  );

  @override
  void close({bool force = false}) {}
}

ApiClient _client(HttpClientAdapter adapter) => ApiClient(
  baseUrl: 'http://api.test.invalid',
  adapter: adapter,
  debugLogging: false,
);

Map<String, Object?> _row(int id, String label, {bool isActive = true}) => {
  'id': id,
  'code': 'C$id',
  'label': label,
  'isActive': isActive,
};

Map<String, Object?> _page(
  List<Map<String, Object?>> items, {
  int? totalCount,
  int page = 1,
  int pageSize = 25,
}) => {
  'items': items,
  'totalCount': totalCount ?? items.length,
  'page': page,
  'pageSize': pageSize,
};

void main() {
  late AppLocalizations l10n;
  setUpAll(() async => l10n = await loadEnglish());

  group('the names', () {
    test('are the three FF-0 lookups, spelled as the route allow-list', () {
      expect(LookupName.values.map((n) => n.path), [
        'building-types',
        'amenity-types',
        'transit-types',
      ]);
    });
  });

  group('lookupFetcher', () {
    test('asks the page and the search of the right lookup', () async {
      final adapter = _FakeAdapter((_) => (200, _page([_row(1, 'Main')])));
      final fetch = LookupService(_client(adapter))
          .lookupFetcher(LookupName.buildingTypes);

      await fetch(search: 'ma', page: 2);

      final request = adapter.requests.single;
      expect(request.method, 'GET');
      expect(request.uri.path, '/api/lookups/building-types');
      expect(request.uri.queryParameters, {'search': 'ma', 'page': '2'});
    });

    test('leaves the search out when it is blank', () async {
      final adapter = _FakeAdapter((_) => (200, _page([])));
      final fetch = LookupService(_client(adapter))
          .lookupFetcher(LookupName.amenityTypes);

      await fetch(search: '', page: 1);

      expect(adapter.requests.single.uri.path, '/api/lookups/amenity-types');
      expect(adapter.requests.single.uri.queryParameters, {'page': '1'});
    });

    test(
      'sends no tenant header and no token (FF-0: the stub decides)',
      () async {
        final adapter = _FakeAdapter((_) => (200, _page([])));
        await LookupService(_client(adapter))
            .lookupFetcher(LookupName.transitTypes)(search: '', page: 1);

        final headers = adapter.requests.single.headers.keys.map(
          (h) => h.toLowerCase(),
        );
        expect(headers, isNot(contains('x-tenant-id')));
        expect(headers, isNot(contains('authorization')));
      },
    );

    test('maps the envelope and each row to a SelectOption', () async {
      final adapter = _FakeAdapter(
        (_) => (
          200,
          _page(
            [_row(1, 'Main building'), _row(7, 'Old wing', isActive: false)],
            totalCount: 9,
            page: 3,
            pageSize: 2,
          ),
        ),
      );
      final result = await LookupService(_client(adapter))
          .lookupFetcher(LookupName.buildingTypes)(search: '', page: 3);

      expect(result.totalCount, 9);
      expect(result.page, 3);
      expect(result.pageSize, 2);
      expect(result.items.map((o) => o.value), [1, 7]);
      expect(result.items.map((o) => o.label), ['Main building', 'Old wing']);
      expect(result.items.map((o) => o.isActive), [true, false]);
    });

    test('an empty page is an empty result, not an error', () async {
      final adapter = _FakeAdapter((_) => (200, _page([])));
      final result = await LookupService(_client(adapter))
          .lookupFetcher(LookupName.buildingTypes)(search: 'zzz', page: 1);
      expect(result.items, isEmpty);
      expect(result.totalCount, 0);
    });

    test('a reply that is not the envelope is refused as unexpected', () async {
      for (final body in <Object?>[
        {'items': 'nope', 'totalCount': 0, 'page': 1, 'pageSize': 25},
        {
          'items': [
            {'id': 1, 'label': 'x'}, // no isActive
          ],
          'totalCount': 1,
          'page': 1,
          'pageSize': 25,
        },
        {
          'items': [
            {'id': 'one', 'label': 'x', 'isActive': true}, // id is not a number
          ],
          'totalCount': 1,
          'page': 1,
          'pageSize': 25,
        },
        {'items': <Object?>[], 'page': 1, 'pageSize': 25}, // no totalCount
        <Object?>[],
      ]) {
        final adapter = _FakeAdapter((_) => (200, body));
        final fetch = LookupService(_client(adapter))
            .lookupFetcher(LookupName.buildingTypes);
        await expectLater(
          fetch(search: '', page: 1),
          throwsA(isA<FormatException>()),
          reason: '$body',
        );
      }
    });
  });

  group('lookupOption', () {
    test('reads the one row by id, even an inactive one', () async {
      final adapter = _FakeAdapter(
        (_) => (200, _row(7, 'Old wing', isActive: false)),
      );
      final option = await LookupService(_client(adapter))
          .lookupOption(LookupName.buildingTypes, 7);

      expect(adapter.requests.single.uri.path, '/api/lookups/building-types/7');
      expect(option.value, 7);
      expect(option.label, 'Old wing');
      expect(option.isActive, isFalse);
    });

    test('an active row is active', () async {
      final adapter = _FakeAdapter((_) => (200, _row(1, 'Main building')));
      final option = await LookupService(_client(adapter))
          .lookupOption(LookupName.transitTypes, 1);
      expect(option.isActive, isTrue);
    });

    test('a reply that is not a row is refused as unexpected', () async {
      final adapter = _FakeAdapter((_) => (200, {'id': 1}));
      await expectLater(
        LookupService(_client(adapter))
            .lookupOption(LookupName.buildingTypes, 1),
        throwsA(isA<FormatException>()),
      );
    });
  });

  // The contract's errors, each worded by formatApiError and never as raw text.
  group('errors', () {
    Future<Object> thrownBy(
      HttpClientAdapter adapter,
      Future<Object?> Function(LookupService service) call,
    ) async {
      try {
        await call(LookupService(_client(adapter)));
      } catch (e) {
        return e;
      }
      fail('expected an error');
    }

    Future<Object?> list(LookupService s) =>
        s.lookupFetcher(LookupName.buildingTypes)(search: '', page: 1);
    Future<Object?> one(LookupService s) =>
        s.lookupOption(LookupName.buildingTypes, 99);

    test('404 shows the server message (unknown name, id or tenant)', () async {
      for (final call in [list, one]) {
        final error = await thrownBy(
          _FakeAdapter((_) => (404, {'error': 'Not found'})),
          call,
        );
        expect(error, isA<DioException>());
        expect(formatApiError(error, l10n), 'Not found');
      }
    });

    test(
      '403 shows the server message (a tenant the stub user lacks)',
      () async {
        final error = await thrownBy(
          _FakeAdapter(
            (_) =>
                (403, {'error': 'This account has no access to that tenant'}),
          ),
          list,
        );
        expect(
          formatApiError(error, l10n),
          'This account has no access to that tenant',
        );
      },
    );

    test('503 shows the server message', () async {
      final error = await thrownBy(
        _FakeAdapter((_) => (503, {'error': 'Database unavailable'})),
        list,
      );
      expect(formatApiError(error, l10n), 'Database unavailable');
    });

    test('500 with no message is the friendly server copy', () async {
      final error = await thrownBy(
        _FakeAdapter((_) => (500, '<html>boom</html>')),
        list,
      );
      expect(formatApiError(error, l10n), l10n.errorServer);
    });

    test(
      'a 500 that names DEV_STUB_USER_EMAIL shows what the server says',
      () async {
        const message =
            'The development stub user is missing: DEV_STUB_USER_EMAIL';
        final error = await thrownBy(
          _FakeAdapter((_) => (500, {'error': message})),
          list,
        );
        expect(formatApiError(error, l10n), message);
      },
    );

    test('a connection failure is the no-connection copy', () async {
      final error = await thrownBy(_ConnectionFailureAdapter(), list);
      expect(formatApiError(error, l10n), l10n.errorNoConnection);
    });

    test('a malformed reply is the unexpected-reply copy', () async {
      final error = await thrownBy(
        _FakeAdapter((_) => (200, {'items': 5})),
        list,
      );
      expect(formatApiError(error, l10n), l10n.errorUnexpectedReply);
    });
  });

  test('the fetcher is a LookupFetcher and an option a SelectOption', () async {
    final service = LookupService(
      _client(_FakeAdapter((_) => (200, _row(2, 'Mall')))),
    );
    final LookupFetcher fetch = service.lookupFetcher(LookupName.buildingTypes);
    final SelectOption option = await service.lookupOption(
      LookupName.buildingTypes,
      2,
    );
    expect(fetch, isA<LookupFetcher>());
    expect(option.label, 'Mall');
  });
}
