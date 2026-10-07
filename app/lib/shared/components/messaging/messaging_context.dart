import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../l10n/app_localizations.dart';
import 'message_notifier.dart';

/// The only way a screen reports an outcome to the user (standard §4.6):
/// `context.showError(e)` and `context.showSuccess('...')`.
/// `ScaffoldMessenger.showSnackBar` is prohibited (linter `no-snackbar`, S4).
extension MessagingContext on BuildContext {
  MessageNotifier get _messages =>
      ProviderScope.containerOf(this).read(messageProvider.notifier);

  /// [error] may be a caught exception (shown through `formatApiError`) or a
  /// ready-made string (shown through `sanitizeErrorText`). The friendly copy
  /// is looked up here, from this context's locale.
  void showError(Object error) =>
      _messages.showError(error, AppLocalizations.of(this));

  /// [text] must already be localised (it comes from `AppLocalizations`).
  void showSuccess(String text) => _messages.showSuccess(text);
}
