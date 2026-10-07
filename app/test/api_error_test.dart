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
  _regressionRawDartErrors();
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

class _Holder {
  late final int value;
}

/// Hides a value from the compiler so a deliberate bad cast or null check is
/// a runtime error, not a compile-time one.
Object? _opaque(Object? value) => int.parse('1') == 1 ? value : 'unused';

/// A real call on null, through dynamic.
void _callMissing(Object? target) {
  // ignore: avoid_dynamic_calls
  (target as dynamic).missing();
}

/// Real unbounded recursion: Dart throws a StackOverflowError.
int _recurse(int n) => _recurse(n + 1) + 1;

/// Regression test for review finding 1: `sanitizeErrorText` let Dart core
/// errors through ("Bad state: No element", "RangeError (length): ...",
/// "Invalid argument(s): ...", "Null check operator used on a null value").
/// Every string below is the real `'$e'` of a real throw, never hand-typed.
void _regressionRawDartErrors() {
  group('sanitizeErrorText: real Dart error strings (review finding 1)', () {
    late AppLocalizations l10n;
    setUpAll(() async => l10n = await loadEnglish());

    final throwers = <String, void Function()>{
      'StateError (List.first)': () => <int>[].first,
      'StateError (explicit)': () => throw StateError('boom'),
      'RangeError (index)': () => <int>[1][5],
      'RangeError.value': () => throw RangeError.value(3, 'x'),
      'ArgumentError': () => throw ArgumentError('bad value'),
      'ArgumentError.value': () => throw ArgumentError.value(1, 'n', 'no'),
      'UnsupportedError': () => List<int>.unmodifiable([1]).add(2),
      'UnimplementedError': () => throw UnimplementedError('later'),
      'TypeError (null cast)': () => _opaque(null) as String,
      'TypeError (type cast)': () => _opaque('text') as int,
      'null check': () => _opaque(null)!.toString(),
      'NoSuchMethodError': () => _callMissing(_opaque(null)),
      'LateInitializationError': () {
        _Holder().value.toString();
      },
      'AssertionError': () => throw AssertionError('failed'),
      'StackOverflowError (real recursion)': () => _recurse(0),
      'OutOfMemoryError': () => throw const OutOfMemoryError(),
      'ConcurrentModificationError': () {
        final list = [1, 2, 3];
        for (final _ in list) {
          list.add(4);
        }
      },
      'FormatException': () => int.parse('x'),
      'TimeoutException': () => throw TimeoutException('slow'),
    };

    for (final entry in throwers.entries) {
      test(entry.key, () {
        Object? caught;
        try {
          entry.value();
        } catch (e) {
          caught = e;
        }
        expect(caught, isNotNull, reason: '${entry.key} did not throw');
        final raw = '$caught';
        // Bare, with leading whitespace, and inside the wrappers a catch block
        // commonly adds (the anchored rules must allow them).
        for (final text in [
          raw,
          '  $raw',
          '\n$raw',
          'Exception: $raw',
          'Error: $raw',
          'Unhandled Exception: $raw',
        ]) {
          expect(
            sanitizeErrorText(text, l10n),
            l10n.errorGeneric,
            reason: 'leaked: $text',
          );
        }
      });
    }

    test('ordinary sentences with those words still pass', () {
      for (final sentence in [
        'The list is invalid. Please check each item.',
        'No element was selected.',
        'Null values are not allowed here.',
        'Type a name to continue.',
        'A range of 3 to 5 guests is allowed.',
      ]) {
        expect(sanitizeErrorText(sentence, l10n), sentence);
      }
    });

    // Regression test for review NEW-1: the sanitizer was too broad and replaced
    // plausible domain wording ("package:" anywhere, "Concurrent modification"
    // anywhere) with the generic copy. Real Dart error strings are matched only
    // at the START of the text; these backend messages must reach the user.
    for (final sentence in [
      'The map package: Level 2 failed to publish.',
      'Concurrent modification: someone else saved this venue first. Reload and try again.',
      'Cannot publish: the level is in a bad state: 3 walkways need review.',
      'This unit has an unsupported operation: it cannot be moved to Level 3.',
      'Venue Aurora: invalid argument count in route 4, check the stops.',
      'Walkway check: assertion failed for Level 2, confirm it and publish again.',
      'Stack of 3 levels is out of memory order; reorder the levels.',
      'Unimplemented for this venue type: ask your administrator.',
      'The dart: frame of this shop is outside the mall plan.',
    ]) {
      test('domain message is shown, not replaced: ', () {
        expect(sanitizeErrorText(sentence, l10n), sentence);
      });
    }
  });
}
