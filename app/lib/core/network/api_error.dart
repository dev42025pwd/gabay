import 'dart:async';

import 'package:dio/dio.dart';

import '../../l10n/app_localizations.dart';

/// Longest message that may reach the screen.
const int kMaxErrorTextLength = 300;

/// Turns any thrown object into text that is safe to show a user (§4.3).
///
/// Order: the backend's `{ "error": "..." }` body, then friendly copy for the
/// HTTP status code, then copy for the exception type. Raw exception text
/// (`$e`) never reaches the UI. The friendly copy comes from ARB through the
/// [l10n] the caller passes in (a service-free function, no BuildContext).
String formatApiError(Object error, AppLocalizations l10n) {
  if (error is DioException) {
    final fromBody = _backendMessage(error.response?.data);
    if (fromBody != null) return sanitizeErrorText(fromBody, l10n);

    final status = error.response?.statusCode;
    if (status != null) return _copyForStatus(status, l10n);

    return switch (error.type) {
      DioExceptionType.connectionTimeout ||
      DioExceptionType.sendTimeout ||
      DioExceptionType.receiveTimeout ||
      DioExceptionType.transformTimeout => l10n.errorTimeout,
      DioExceptionType.connectionError => l10n.errorNoConnection,
      DioExceptionType.cancel => l10n.errorCancelled,
      DioExceptionType.badCertificate => l10n.errorNoConnection,
      DioExceptionType.badResponse => l10n.errorUnexpectedReply,
      DioExceptionType.unknown => l10n.errorGeneric,
    };
  }
  return switch (error) {
    TimeoutException() => l10n.errorTimeout,
    FormatException() => l10n.errorUnexpectedReply,
    _ => l10n.errorGeneric,
  };
}

/// Safety net inside the central `showError`: if text that looks like a raw
/// exception or a stack trace is about to be shown, replace it with generic
/// copy; otherwise collapse whitespace and cap the length.
String sanitizeErrorText(String text, AppLocalizations l10n) {
  final collapsed = text.replaceAll(RegExp(r'\s+'), ' ').trim();
  if (collapsed.isEmpty ||
      _looksRaw.hasMatch(text) ||
      _dartCoreMessage.hasMatch(text) ||
      _looksLikeHtml.hasMatch(text)) {
    return l10n.errorGeneric;
  }
  if (collapsed.length <= kMaxErrorTextLength) return collapsed;
  return '${collapsed.substring(0, kMaxErrorTextLength - 1)}…';
}

/// Text that is the `toString()` of a Dart exception or error, or a stack
/// trace, must never reach a user. Three rules, all case-sensitive on purpose
/// (`SocketException` is raw text, the word "exception" in a sentence is not):
///
/// 1. CamelCase class names and their `Name:` form, matched anywhere (an
///    identifier such as `StateError` does not occur in prose).
/// 2. Stack-trace shapes: a `#0  name (` frame, `(dart:core/...)`, and a
///    `package:name/` URI. Never the bare word "package:" (a domain message
///    can say "The map package: Level 2 failed").
/// 3. [_dartCoreMessage]: the fixed messages Dart core errors print WITHOUT
///    their class name, matched only at the START of the text.
///
/// `test/api_error_test.dart` generates the strings from real throws, and also
/// holds domain sentences that must pass through untouched.
final RegExp _looksRaw = RegExp(
  r'(DioException|DioError|\bException:|\b[A-Z]\w*Exception\b|\b[A-Z]\w*Error:|'
  r'\b(?:NoSuchMethodError|LateInitializationError|StateError|TypeError|'
  r'AssertionError|RangeError|ArgumentError|UnsupportedError|'
  r'UnimplementedError|StackOverflowError|OutOfMemoryError|'
  r'ConcurrentModificationError)\b|'
  r"XMLHttpRequest|Instance of '|#\d+\s+\S+\s+\(|package:\w+/|\(dart:\w+)",
);

/// What Dart core errors print without a class name, anchored to the start of
/// the text (after optional whitespace and an `Exception: ` / `Error: `
/// wrapper), so a domain sentence that merely contains one of these phrases,
/// for example "Concurrent modification: someone else saved this venue", is
/// shown. "Concurrent modification" is only raw when followed by "during
/// iteration", which is what Dart prints.
final RegExp _dartCoreMessage = RegExp(
  r'^\s*(?:(?:Unhandled Exception|Exception|Error):\s*)*(?:'
  r'Bad state:|Invalid argument(?:\(s\)| \()|Unsupported operation:|'
  r'Null check operator|'
  r"type '[^']*' is not a subtype of type|"
  r'Assertion failed|Stack Overflow\b|Out of Memory\b|'
  r'Concurrent modification during iteration)',
);

final RegExp _looksLikeHtml = RegExp(r'<!doctype|<html', caseSensitive: false);

String? _backendMessage(Object? data) {
  if (data is Map) {
    final message = data['error'];
    if (message is String && message.trim().isNotEmpty) return message;
  }
  return null;
}

String _copyForStatus(int status, AppLocalizations l10n) => switch (status) {
  400 => l10n.errorBadRequest,
  401 => l10n.errorUnauthenticated,
  403 => l10n.errorForbidden,
  404 => l10n.errorNotFound,
  409 => l10n.errorConflict,
  413 => l10n.errorTooLarge,
  422 => l10n.errorInvalid,
  429 => l10n.errorTooManyRequests,
  503 => l10n.errorUnavailable,
  >= 500 => l10n.errorServer,
  _ => l10n.errorGeneric,
};
