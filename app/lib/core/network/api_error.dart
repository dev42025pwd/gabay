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
      _looksLikeHtml.hasMatch(text)) {
    return l10n.errorGeneric;
  }
  if (collapsed.length <= kMaxErrorTextLength) return collapsed;
  return '${collapsed.substring(0, kMaxErrorTextLength - 1)}…';
}

/// Text that is the `toString()` of a Dart exception or error, or a stack
/// trace, must never reach a user. Case-sensitive on purpose: `SocketException`
/// is raw text, the word "exception" in a sentence is not.
///
/// Two families: (1) class names and their `Name:` form; (2) the fixed
/// messages Dart core errors print WITHOUT their class name ("Bad state: ...",
/// "Invalid argument(s): ...", "Null check operator used on a null value").
/// `test/api_error_test.dart` generates every message below from a real throw.
final RegExp _looksRaw = RegExp(
  r'(DioException|DioError|\bException:|\b[A-Z]\w*Exception\b|\b[A-Z]\w*Error:|'
  r'\b(?:NoSuchMethodError|LateInitializationError|StateError|TypeError|'
  r'AssertionError|RangeError|ArgumentError|UnsupportedError|'
  r'UnimplementedError|StackOverflowError|OutOfMemoryError|'
  r'ConcurrentModificationError)\b|'
  r'\bBad state:|\bInvalid argument(?:\(s\)| \()|\bUnsupported operation:|'
  r"\bNull check operator|\bis not a subtype of type\b|\bAssertion failed|"
  r'\bStack Overflow\b|\bOut of Memory\b|\bConcurrent modification|'
  r"\bUnimplemented|XMLHttpRequest|Instance of '|#\d+\s+\S+\s+\(|package:|dart:)",
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
