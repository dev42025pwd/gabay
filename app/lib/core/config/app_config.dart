import 'package:flutter/foundation.dart';

/// Client configuration (standard §4.9).
///
/// `apiBaseUrl` precedence: `--dart-define=API_BASE=<url>` first, then a
/// per-mode default. A release build with no `API_BASE` is refused, so a
/// define-less release can never silently target localhost.
abstract final class AppConfig {
  static const String _apiBaseDefine = String.fromEnvironment('API_BASE');

  /// The local Firebase Functions emulator (project `demo-gabay`, region
  /// `asia-southeast1`, function `api`). Debug and profile builds only.
  ///
  /// An Android emulator reaches the host as 10.0.2.2, not 127.0.0.1: pass
  /// `--dart-define=API_BASE=http://10.0.2.2:5001/demo-gabay/asia-southeast1/api`.
  static const String debugApiBase =
      'http://127.0.0.1:5001/demo-gabay/asia-southeast1/api';

  /// The resolved API base URL, without a trailing slash.
  static String get apiBaseUrl =>
      resolveApiBaseUrl(define: _apiBaseDefine, releaseMode: kReleaseMode);

  /// Pure so it can be tested with both modes (a test cannot change
  /// `kReleaseMode`).
  static String resolveApiBaseUrl({
    required String define,
    required bool releaseMode,
  }) {
    final trimmed = define.trim();
    if (releaseMode) {
      if (trimmed.isEmpty) {
        throw StateError(
          'API_BASE is not set. A release build must be built with '
          '--dart-define=API_BASE=<https url>; it never falls back to '
          'localhost.',
        );
      }
      if (_pointsAtThisMachine(trimmed)) {
        throw StateError(
          'API_BASE ($trimmed) points at this machine. A release build must '
          'target the deployed API.',
        );
      }
    }
    final chosen = trimmed.isEmpty ? debugApiBase : trimmed;
    return chosen.endsWith('/')
        ? chosen.substring(0, chosen.length - 1)
        : chosen;
  }

  static bool _pointsAtThisMachine(String url) {
    final host = Uri.tryParse(url)?.host.toLowerCase() ?? '';
    return host == 'localhost' ||
        host == '127.0.0.1' ||
        host == '10.0.2.2' ||
        host == '[::1]' ||
        host == '::1' ||
        host.isEmpty;
  }
}
