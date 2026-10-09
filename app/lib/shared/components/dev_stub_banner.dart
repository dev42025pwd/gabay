import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config/dev_stub_provider.dart';
import '../../l10n/app_localizations.dart';

/// Puts the "Development build: no sign-in" banner above every admin page
/// while the development stub stands in for sign-in (E-20, FF-0), so every
/// screenshot and every screen shows the state. Mounted once, in
/// `MaterialApp.builder` (see `GabayApp`), so a later admin screen cannot
/// forget it. R8 (sign-in) removes it.
///
/// Where [devStubBannerVisibleProvider] says no (the shopper app, an admin
/// release build made without `DEV_STUB=true`) the page is returned untouched.
class DevStubBannerFrame extends ConsumerWidget {
  const DevStubBannerFrame({required this.child, super.key});

  final Widget? child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final page = child ?? const SizedBox.shrink();
    if (!ref.watch(devStubBannerVisibleProvider)) return page;
    // Laid out upward, so the page (first child) sits at the bottom and the
    // banner (second) at the top. The banner must be painted AFTER the page:
    // the Navigator's route barrier blocks the semantics of everything painted
    // before it, and a banner painted first is silent to a screen reader.
    return Column(
      verticalDirection: VerticalDirection.up,
      children: [
        // The banner takes the top inset (status bar, cut-out); the page below
        // must not take it a second time.
        Expanded(
          child: MediaQuery.removePadding(
            context: context,
            removeTop: true,
            child: page,
          ),
        ),
        DevStubBanner(text: AppLocalizations.of(context).devStubBanner),
      ],
    );
  }
}

/// The banner itself: an icon and a line of text on the theme's tertiary
/// container, full width. It grows with the text size and wraps, so nothing
/// clips at text size x1.4 or in a longer translation. Status is never colour
/// alone: the icon and the words say it too.
class DevStubBanner extends StatelessWidget {
  const DevStubBanner({required this.text, super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colours = theme.colorScheme;
    return Semantics(
      container: true,
      label: text,
      // The words are read once, from the label above; the icon is decoration.
      child: ExcludeSemantics(
        child: Material(
          color: colours.tertiaryContainer,
          textStyle: theme.textTheme.labelLarge?.copyWith(
            color: colours.onTertiaryContainer,
          ),
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Center(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      Icons.developer_mode,
                      size: 20,
                      color: colours.onTertiaryContainer,
                    ),
                    const SizedBox(width: 8),
                    Flexible(child: Text(text)),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
