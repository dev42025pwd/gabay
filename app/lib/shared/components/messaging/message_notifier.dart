import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_error.dart';
import 'app_message.dart';

/// How long a success message stays.
const Duration kSuccessMessageDuration = Duration(seconds: 5);

/// Errors stay longer: they usually need reading twice and acting on.
const Duration kErrorMessageDuration = Duration(seconds: 10);

/// Holds the current message (or null). The overlay in `MaterialApp.builder`
/// renders it above the Navigator, so it floats over dialogs too.
class MessageNotifier extends Notifier<AppMessage?> {
  Timer? _timer;
  int _lastId = 0;

  @override
  AppMessage? build() {
    ref.onDispose(() => _timer?.cancel());
    return null;
  }

  /// Shows [error] as an error message. Strings pass through
  /// [sanitizeErrorText] (the safety net: no call site can leak raw exception
  /// text); anything else goes through [formatApiError].
  void showError(Object error) {
    final text = error is String
        ? sanitizeErrorText(error)
        : formatApiError(error);
    _show(AppMessageKind.error, text, kErrorMessageDuration);
  }

  void showSuccess(String text) =>
      _show(AppMessageKind.success, text, kSuccessMessageDuration);

  void dismiss() {
    _timer?.cancel();
    state = null;
  }

  void _show(AppMessageKind kind, String text, Duration lifetime) {
    _timer?.cancel();
    final message = AppMessage(id: ++_lastId, kind: kind, text: text);
    state = message;
    _timer = Timer(lifetime, () {
      if (state?.id == message.id) state = null;
    });
  }
}

final NotifierProvider<MessageNotifier, AppMessage?> messageProvider =
    NotifierProvider<MessageNotifier, AppMessage?>(MessageNotifier.new);
