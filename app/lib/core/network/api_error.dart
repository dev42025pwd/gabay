import 'dart:async';

import 'package:dio/dio.dart';

import '../copy/app_copy.dart';

/// Longest message that may reach the screen.
const int kMaxErrorTextLength = 300;

/// Turns any thrown object into text that is safe to show a user (§4.3).
///
/// Order: the backend's `{ "error": "..." }` body, then friendly copy for the
/// HTTP status code, then copy for the exception type. Raw exception text
/// (`$e`) never reaches the UI.
String formatApiError(Object error) {
  if (error is DioException) {
    final fromBody = _backendMessage(error.response?.data);
    if (fromBody != null) return sanitizeErrorText(fromBody);

    final status = error.response?.statusCode;
    if (status != null) return _copyForStatus(status);

    return switch (error.type) {
      DioExceptionType.connectionTimeout ||
      DioExceptionType.sendTimeout ||
      DioExceptionType.receiveTimeout ||
      DioExceptionType.transformTimeout => AppCopy.errorTimeout,
      DioExceptionType.connectionError => AppCopy.errorNoConnection,
      DioExceptionType.cancel => AppCopy.errorCancelled,
      DioExceptionType.badCertificate => AppCopy.errorNoConnection,
      DioExceptionType.badResponse => AppCopy.errorUnexpectedReply,
      DioExceptionType.unknown => AppCopy.errorGeneric,
    };
  }
  return switch (error) {
    TimeoutException() => AppCopy.errorTimeout,
    FormatException() => AppCopy.errorUnexpectedReply,
    _ => AppCopy.errorGeneric,
  };
}

/// Safety net inside the central `showError`: if text that looks like a raw
/// exception or a stack trace is about to be shown, replace it with generic
/// copy; otherwise collapse whitespace and cap the length.
String sanitizeErrorText(String text) {
  final collapsed = text.replaceAll(RegExp(r'\s+'), ' ').trim();
  if (collapsed.isEmpty ||
      _looksRaw.hasMatch(text) ||
      _looksLikeHtml.hasMatch(text)) {
    return AppCopy.errorGeneric;
  }
  if (collapsed.length <= kMaxErrorTextLength) return collapsed;
  return '${collapsed.substring(0, kMaxErrorTextLength - 1)}…';
}

/// Case-sensitive on purpose: `SocketException` is raw text, the word
/// "exception" in a sentence is not.
final RegExp _looksRaw = RegExp(
  r'(DioException|DioError|\bException:|\b[A-Z]\w*Exception\b|\b[A-Z]\w*Error:|'
  r"XMLHttpRequest|Instance of '|#\d+\s+\S+\s+\(|package:|dart:)",
);

final RegExp _looksLikeHtml = RegExp(r'<!doctype|<html', caseSensitive: false);

String? _backendMessage(Object? data) {
  if (data is Map) {
    final message = data['error'];
    if (message is String && message.trim().isNotEmpty) return message;
  }
  return null;
}

String _copyForStatus(int status) => switch (status) {
  400 => AppCopy.errorBadRequest,
  401 => AppCopy.errorUnauthenticated,
  403 => AppCopy.errorForbidden,
  404 => AppCopy.errorNotFound,
  409 => AppCopy.errorConflict,
  413 => AppCopy.errorTooLarge,
  422 => AppCopy.errorInvalid,
  429 => AppCopy.errorTooManyRequests,
  503 => AppCopy.errorUnavailable,
  >= 500 => AppCopy.errorServer,
  _ => AppCopy.errorGeneric,
};
