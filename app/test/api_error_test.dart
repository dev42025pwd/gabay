import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gabay/core/network/api_error.dart';
import 'package:gabay/l10n/app_localizations.dart';

import 'support/shell_harness.dart';

DioException _dio({
  int? status,
  Object? body,
  DioExceptionType type = DioExceptionType.badResponse,
}) {
  final request = RequestOptions(path: '/x');
  return DioException(
    requestOptions: request,
    type: type,
    response: status == null
        ? null
        : Response<Object?>(
            requestOptions: request,
            statusCode: status,
            data: body,
          ),
  );
}

void main() {
  late AppLocalizations l10n;
  setUpAll(() async => l10n = await loadEnglish());

  String format(Object error) => formatApiError(error, l10n);

  group('formatApiError', () {
    test('uses the backend { error } body first, even with a status code', () {
      expect(
        format(_dio(status: 409, body: {'error': 'Name already used.'})),
        'Name already used.',
      );
    });

    test('falls back to friendly copy for the status code', () {
      expect(format(_dio(status: 400)), l10n.errorBadRequest);
      expect(format(_dio(status: 401)), l10n.errorUnauthenticated);
      expect(format(_dio(status: 403)), l10n.errorForbidden);
      expect(format(_dio(status: 404)), l10n.errorNotFound);
      expect(format(_dio(status: 409)), l10n.errorConflict);
      expect(format(_dio(status: 413)), l10n.errorTooLarge);
      expect(format(_dio(status: 422)), l10n.errorInvalid);
      expect(format(_dio(status: 429)), l10n.errorTooManyRequests);
      expect(format(_dio(status: 500)), l10n.errorServer);
      expect(format(_dio(status: 502)), l10n.errorServer);
      expect(format(_dio(status: 503)), l10n.errorUnavailable);
      expect(format(_dio(status: 418)), l10n.errorGeneric);
    });

    test('ignores a body that has no usable { error } string', () {
      expect(
        format(_dio(status: 404, body: {'error': ''})),
        l10n.errorNotFound,
      );
      expect(
        format(_dio(status: 404, body: {'error': 42})),
        l10n.errorNotFound,
      );
      expect(
        format(_dio(status: 404, body: '<html>Not Found</html>')),
        l10n.errorNotFound,
      );
    });

    test('with no response, goes by the Dio exception type', () {
      expect(
        format(_dio(type: DioExceptionType.connectionTimeout)),
        l10n.errorTimeout,
      );
      expect(
        format(_dio(type: DioExceptionType.receiveTimeout)),
        l10n.errorTimeout,
      );
      expect(
        format(_dio(type: DioExceptionType.connectionError)),
        l10n.errorNoConnection,
      );
      expect(format(_dio(type: DioExceptionType.cancel)), l10n.errorCancelled);
      expect(format(_dio(type: DioExceptionType.unknown)), l10n.errorGeneric);
    });

    test('goes by exception type for non-Dio errors and never echoes them', () {
      expect(format(TimeoutException('x')), l10n.errorTimeout);
      expect(format(const FormatException('bad')), l10n.errorUnexpectedReply);
      final text = format(StateError('secret internal detail'));
      expect(text, l10n.errorGeneric);
      expect(text, isNot(contains('secret')));
    });

    test('a backend message that looks like a raw exception is replaced', () {
      expect(
        format(
          _dio(status: 500, body: {'error': 'DioException [bad response]'}),
        ),
        l10n.errorGeneric,
      );
    });
  });

  group('sanitizeErrorText', () {
    String sanitize(String text) => sanitizeErrorText(text, l10n);

    test('passes plain sentences, collapsing whitespace', () {
      expect(sanitize('  Name   is\n taken. '), 'Name is taken.');
    });

    test('keeps a normal sentence that mentions the word exception', () {
      expect(
        sanitize('Make an exception request to the mall.'),
        'Make an exception request to the mall.',
      );
    });

    test('replaces raw exception text, stack traces and HTML', () {
      for (final raw in [
        'DioException [connection error]: The connection errored',
        'SocketException: Failed host lookup',
        'Exception: boom',
        "Instance of 'ApiClient'",
        'TypeError: x is not a function',
        '#0      main (package:gabay/main.dart:10:3)',
        '<!DOCTYPE html><html></html>',
        '',
        '   ',
      ]) {
        expect(sanitize(raw), l10n.errorGeneric, reason: raw);
      }
    });

    test('caps the length with an ellipsis', () {
      final long = 'a' * 1000;
      final cleaned = sanitize(long);
      expect(cleaned.length, kMaxErrorTextLength);
      expect(cleaned.endsWith('…'), isTrue);
    });
  });
}
