import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/gabay_tokens.dart';
import '../../../l10n/app_localizations.dart';
import 'app_message.dart';
import 'message_notifier.dart';

/// Widest the banner grows, so it stays readable on a tablet.
const double kMessageMaxWidth = 560;

/// Mounted once, in `MaterialApp.builder`, ABOVE the Navigator (standard
/// §4.6): `builder: (context, child) => MessageOverlay(child: child)`.
/// The banner floats over pages and dialogs alike.
///
/// Status is never colour alone: each message has an icon and a spoken or
/// written prefix ("Error", "Success"), and is announced to screen readers as
/// a live region.
class MessageOverlay extends ConsumerWidget {
  const MessageOverlay({required this.child, super.key});

  final Widget? child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final message = ref.watch(messageProvider);
    return Stack(
      children: [
        if (child != null) Positioned.fill(child: child!),
        if (message != null)
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(
                      maxWidth: kMessageMaxWidth,
                    ),
                    child: _MessageBanner(
                      key: ValueKey<int>(message.id),
                      message: message,
                      onDismiss: ref.read(messageProvider.notifier).dismiss,
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _MessageBanner extends StatelessWidget {
  const _MessageBanner({
    required this.message,
    required this.onDismiss,
    super.key,
  });

  final AppMessage message;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final tokens = GabayTokens.of(context);
    final l10n = AppLocalizations.of(context);
    final isError = message.kind == AppMessageKind.error;
    final background = isError
        ? scheme.errorContainer
        : tokens.successContainer;
    final foreground = isError
        ? scheme.onErrorContainer
        : tokens.onSuccessContainer;
    final icon = isError ? Icons.error_outline : Icons.check_circle_outline;
    final prefix = isError
        ? l10n.messageErrorPrefix
        : l10n.messageSuccessPrefix;

    // No Tooltip here: this banner sits above the Navigator, so it has no
    // Overlay ancestor. The dismiss button is named through Semantics.
    return Material(
      color: background,
      elevation: 3,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.only(left: 16, top: 4, bottom: 4),
        child: Row(
          children: [
            Expanded(
              child: Semantics(
                liveRegion: true,
                container: true,
                label: '$prefix: ${message.text}',
                child: ExcludeSemantics(
                  child: Row(
                    children: [
                      Icon(icon, color: foreground),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Text.rich(
                            TextSpan(
                              children: [
                                TextSpan(
                                  text: '$prefix: ',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                TextSpan(text: message.text),
                              ],
                            ),
                            style: TextStyle(color: foreground),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            Semantics(
              button: true,
              label: l10n.messageDismissAction,
              excludeSemantics: true,
              onTap: onDismiss,
              child: IconButton(
                icon: Icon(Icons.close, color: foreground),
                onPressed: onDismiss,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
