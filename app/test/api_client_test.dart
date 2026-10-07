import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gabay/core/network/api_client.dart';
import 'package:gabay/core/network/network_providers.dart';

/// A fake transport written for these tests: records every request and
/// answers with a fixed status. No network is touched.
class FakeAdapter implements HttpClientAdapter {
  FakeAdapter({this.status = 200});

  final int status;
  final List<RequestOptions> requests = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return ResponseBody.fromString(
      jsonEncode({'ok': status < 400}),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

ApiClient _client(
  FakeAdapter adapter, {
  bool debugLogging = false,
  String? token,
  String? tenant,
  VoidCallback? onUnauthenticated,
  List<String> signInPaths = kDefaultSignInPaths,
}) {
  return ApiClient(
      baseUrl: 'http://api.test.invalid',
      adapter: adapter,
      debugLogging: debugLogging,
      signInPaths: signInPaths,
    )
    ..tokenProvider = (() => token)
    ..tenantIdProvider = (() => tenant)
    ..onUnauthenticated = onUnauthenticated;
}

void main() {
  group('header injection', () {
    test('adds X-Tenant-Id and a Bearer token when both are set', () async {
      final adapter = FakeAdapter();
      final client = _client(adapter, token: 'tok-1', tenant: 'tenant-9');
      await client.get<Object?>('/venues');

      final headers = adapter.requests.single.headers;
      expect(headers['X-Tenant-Id'], 'tenant-9');
      expect(headers['Authorization'], 'Bearer tok-1');
    });

    test('adds neither header when the callbacks return null', () async {
      final adapter = FakeAdapter();
      await _client(adapter).get<Object?>('/venues');

      final headers = adapter.requests.single.headers;
      expect(headers.containsKey('X-Tenant-Id'), isFalse);
      expect(headers.containsKey('Authorization'), isFalse);
    });

    test(
      'a per-call Authorization header wins over the injected token',
      () async {
        final adapter = FakeAdapter();
        final client = _client(adapter, token: 'tok-1');
        await client.get<Object?>(
          '/venues',
          options: Options(headers: {'Authorization': 'Bearer per-call'}),
        );
        expect(
          adapter.requests.single.headers['Authorization'],
          'Bearer per-call',
        );
      },
    );

    test('a per-call authorization header in any case also wins', () async {
      final adapter = FakeAdapter();
      final client = _client(adapter, token: 'tok-1');
      await client.get<Object?>(
        '/venues',
        options: Options(headers: {'authorization': 'Bearer per-call'}),
      );
      final sent = adapter.requests.single.headers.entries
          .where((e) => e.key.toLowerCase() == 'authorization')
          .map((e) => e.value)
          .toList();
      expect(sent, ['Bearer per-call']);
    });

    test(
      'reads the callbacks at call time, so a rotated token is used',
      () async {
        final adapter = FakeAdapter();
        var token = 'old';
        final client = ApiClient(
          baseUrl: 'http://api.test.invalid',
          adapter: adapter,
          debugLogging: false,
        )..tokenProvider = (() => token);
        await client.get<Object?>('/a');
        token = 'new';
        await client.get<Object?>('/b');
        expect(adapter.requests[0].headers['Authorization'], 'Bearer old');
        expect(adapter.requests[1].headers['Authorization'], 'Bearer new');
      },
    );
  });

  group('401 handler', () {
    test('calls onUnauthenticated once and freezes the request', () async {
      var calls = 0;
      var completed = false;
      final called = Completer<void>();
      final client = _client(
        FakeAdapter(status: 401),
        onUnauthenticated: () {
          calls++;
          called.complete();
        },
      );

      unawaited(
        client
            .get<Object?>('/venues')
            .then((_) => completed = true, onError: (_) => completed = true),
      );
      // Waits for the signal itself, not for a guessed delay.
      await called.future.timeout(const Duration(seconds: 5));
      await Future<void>.delayed(Duration.zero);

      expect(calls, 1);
      // Deliberately neither resolved nor forwarded (standard A.11).
      expect(completed, isFalse);
    });

    test('no path is a sign-in path by default (Firebase Auth does not call our API)', () {
      expect(kDefaultSignInPaths, isEmpty);
      expect(
        ApiClient(baseUrl: 'http://api.test.invalid').signInPaths,
        isEmpty,
      );
    });

    test(
      'with the default list, a 401 on any path calls onUnauthenticated',
      () async {
        var calls = 0;
        final allCalled = Completer<void>();
        final client = _client(
          FakeAdapter(status: 401),
          onUnauthenticated: () {
            if (++calls == 3) allCalled.complete();
          },
        );
        for (final path in ['/auth/login', '/auth/verify', '/venues']) {
          unawaited(client.get<Object?>(path).then((_) {}, onError: (_) {}));
        }
        // Waits for the third signal itself, not for a guessed delay.
        await allCalled.future.timeout(const Duration(seconds: 5));
        expect(calls, 3);
      },
    );

    test(
      'skips a path listed in signInPaths: the caller sees the real 401',
      () async {
        var calls = 0;
        final client = _client(
          FakeAdapter(status: 401),
          onUnauthenticated: () => calls++,
          signInPaths: const ['/auth/login', '/auth/verify'],
        );

        for (final path in ['/auth/login', '/auth/verify']) {
          await expectLater(
            client.post<Object?>(path),
            throwsA(
              isA<DioException>().having(
                (e) => e.response?.statusCode,
                'status',
                401,
              ),
            ),
          );
        }
        expect(calls, 0);
      },
    );

    test('forwards other errors untouched', () async {
      var calls = 0;
      final client = _client(
        FakeAdapter(status: 403),
        onUnauthenticated: () => calls++,
      );
      await expectLater(
        client.get<Object?>('/venues'),
        throwsA(
          isA<DioException>().having(
            (e) => e.response?.statusCode,
            'status',
            403,
          ),
        ),
      );
      expect(calls, 0);
    });
  });

  group('debug logger', () {
    test(
      'logs method, path and status but never a token or a header',
      () async {
        final logs = <String>[];
        final original = debugPrint;
        debugPrint = (message, {wrapWidth}) => logs.add(message ?? '');
        addTearDown(() => debugPrint = original);

        final client = _client(
          FakeAdapter(),
          debugLogging: true,
          token: 'super-secret-token',
          tenant: 'tenant-9',
        );
        await client.get<Object?>('/venues');

        expect(logs, ['-> GET /venues', '<- 200 /venues']);
        expect(logs.join(), isNot(contains('super-secret-token')));
      },
    );

    test('is silent when debug logging is off', () async {
      final logs = <String>[];
      final original = debugPrint;
      debugPrint = (message, {wrapWidth}) => logs.add(message ?? '');
      addTearDown(() => debugPrint = original);

      await _client(FakeAdapter()).get<Object?>('/venues');
      expect(logs, isEmpty);
    });
  });

  group('providers', () {
    test(
      'apiClientProvider wires the three callbacks to the Phase 2 slots',
      () async {
        var signedOut = 0;
        final signedOutCalled = Completer<void>();
        final adapter = FakeAdapter(status: 401);
        final container = ProviderContainer(
          overrides: [
            apiBaseUrlProvider.overrideWithValue('http://api.test.invalid'),
            sessionTokenProvider.overrideWithValue('slot-token'),
            activeTenantIdProvider.overrideWithValue('slot-tenant'),
            unauthenticatedHandlerProvider.overrideWithValue(() {
              signedOut++;
              signedOutCalled.complete();
            }),
          ],
        );
        addTearDown(container.dispose);

        final client = container.read(apiClientProvider);
        client.dio.httpClientAdapter = adapter;
        expect(identical(client, container.read(apiClientProvider)), isTrue);

        unawaited(client.get<Object?>('/venues').then((_) {}, onError: (_) {}));
        await signedOutCalled.future.timeout(const Duration(seconds: 5));

        expect(
          adapter.requests.single.headers['Authorization'],
          'Bearer slot-token',
        );
        expect(adapter.requests.single.headers['X-Tenant-Id'], 'slot-tenant');
        expect(signedOut, 1);
      },
    );
  });
}
