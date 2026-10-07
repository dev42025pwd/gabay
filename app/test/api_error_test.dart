import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gabay/core/copy/app_copy.dart';
import 'package:gabay/core/network/api_error.dart';

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
  group('formatApiError', () {
    test('uses the backend { error } body first, even with a status code', () {
      expect(
        formatApiError(
          _dio(status: 409, body: {'error': 'Name already used.'}),
        ),
        'Name already used.',
      );
    });

    test('falls back to friendly copy for the status code', () {
      expect(formatApiError(_dio(status: 400)), AppCopy.errorBadRequest);
      expect(formatApiError(_dio(status: 401)), AppCopy.errorUnauthenticated);
      expect(formatApiError(_dio(status: 403)), AppCopy.errorForbidden);
      expect(formatApiError(_dio(status: 404)), AppCopy.errorNotFound);
      expect(formatApiError(_dio(status: 409)), AppCopy.errorConflict);
      expect(formatApiError(_dio(status: 413)), AppCopy.errorTooLarge);
      expect(formatApiError(_dio(status: 422)), AppCopy.errorInvalid);
      expect(formatApiError(_dio(status: 429)), AppCopy.errorTooManyRequests);
      expect(formatApiError(_dio(status: 500)), AppCopy.errorServer);
      expect(formatApiError(_dio(status: 502)), AppCopy.errorServer);
      expect(formatApiError(_dio(status: 503)), AppCopy.errorUnavailable);
      expect(formatApiError(_dio(status: 418)), AppCopy.errorGeneric);
    });

    test('ignores a body that has no usable { error } string', () {
      expect(
        formatApiError(_dio(status: 404, body: {'error': ''})),
        AppCopy.errorNotFound,
      );
      expect(
        formatApiError(_dio(status: 404, body: {'error': 42})),
        AppCopy.errorNotFound,
      );
      expect(
        formatApiError(_dio(status: 404, body: '<html>Not Found</html>')),
        AppCopy.errorNotFound,
      );
    });

    test('with no response, goes by the Dio exception type', () {
      expect(
        formatApiError(_dio(type: DioExceptionType.connectionTimeout)),
        AppCopy.errorTimeout,
      );
      expect(
        formatApiError(_dio(type: DioExceptionType.receiveTimeout)),
        AppCopy.errorTimeout,
      );
      expect(
        formatApiError(_dio(type: DioExceptionType.connectionError)),
        AppCopy.errorNoConnection,
      );
      expect(
        formatApiError(_dio(type: DioExceptionType.cancel)),
        AppCopy.errorCancelled,
      );
      expect(
        formatApiError(_dio(type: DioExceptionType.unknown)),
        AppCopy.errorGeneric,
      );
    });

    test('goes by exception type for non-Dio errors and never echoes them', () {
      expect(formatApiError(TimeoutException('x')), AppCopy.errorTimeout);
      expect(
        formatApiError(const FormatException('bad')),
        AppCopy.errorUnexpectedReply,
      );
      final text = formatApiError(StateError('secret internal detail'));
      expect(text, AppCopy.errorGeneric);
      expect(text, isNot(contains('secret')));
    });

    test('a backend message that looks like a raw exception is replaced', () {
      expect(
        formatApiError(
          _dio(status: 500, body: {'error': 'DioException [bad response]'}),
        ),
        AppCopy.errorGeneric,
      );
    });
  });

  group('sanitizeErrorText', () {
    test('passes plain sentences, collapsing whitespace', () {
      expect(sanitizeErrorText('  Name   is\n taken. '), 'Name is taken.');
    });

    test('keeps a normal sentence that mentions the word exception', () {
      expect(
        sanitizeErrorText('Make an exception request to the mall.'),
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
        expect(sanitizeErrorText(raw), AppCopy.errorGeneric, reason: raw);
      }
    });

    test('caps the length with an ellipsis', () {
      final long = 'a' * 1000;
      final cleaned = sanitizeErrorText(long);
      expect(cleaned.length, kMaxErrorTextLength);
      expect(cleaned.endsWith('…'), isTrue);
    });
  });
}
