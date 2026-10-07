import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/config/app_version.dart';
import '../../core/config/changelog.dart';
import '../../core/config/surface_provider.dart';
import '../../core/copy/app_copy.dart';
import '../../core/theme/gabay_tokens.dart';
import 'messaging/messaging_context.dart';

/// Widest the placeholder content grows (tablet and browser windows).
const double kPlaceholderMaxWidth = 640;

/// Placeholder home for both surfaces. It exists so the router, the theme and
/// the messaging overlay are exercised before any feature exists; the next
/// phase replaces it. No product behaviour lives here.
class SurfaceHomeScreen extends ConsumerWidget {
  const SurfaceHomeScreen({super.key});

  static const String path = '/';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final surface = ref.watch(surfaceProvider);
    final tokens = GabayTokens.of(context);
    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(title: const Text(AppCopy.appName)),
      body: _PlaceholderBody(
        children: [
          Text(AppCopy.appName, style: textTheme.displaySmall),
          const SizedBox(height: 4),
          Text(surface.displayName, style: textTheme.titleLarge),
          const SizedBox(height: 16),
          _VersionLines(version: surface.version),
          const SizedBox(height: 16),
          // Status is never colour alone: icon + label.
          DecoratedBox(
            decoration: BoxDecoration(
              color: tokens.infoContainer,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  Icon(Icons.info_outline, color: tokens.onInfoContainer),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      AppCopy.skeletonStatus,
                      style: TextStyle(color: tokens.onInfoContainer),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              FilledButton(
                onPressed: () => context.go(SurfaceAboutScreen.path),
                child: const Text(AppCopy.aboutAction),
              ),
              OutlinedButton(
                onPressed: () => context.showSuccess(AppCopy.sampleSuccess),
                child: const Text(AppCopy.showSuccessAction),
              ),
              OutlinedButton(
                onPressed: () => context.showError(AppCopy.sampleError),
                child: const Text(AppCopy.showErrorAction),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Placeholder About page: version lines and the list of changes.
class SurfaceAboutScreen extends ConsumerWidget {
  const SurfaceAboutScreen({super.key});

  static const String path = '/about';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final surface = ref.watch(surfaceProvider);
    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: AppCopy.backAction,
          icon: const Icon(Icons.arrow_back),
          // go(), not pop(): the address bar stays honest (standard 4.6).
          onPressed: () => context.go(SurfaceHomeScreen.path),
        ),
        title: const Text(AppCopy.aboutTitle),
      ),
      body: _PlaceholderBody(
        children: [
          Text(surface.displayName, style: textTheme.titleLarge),
          const SizedBox(height: 12),
          _VersionLines(version: surface.version),
          const SizedBox(height: 24),
          Text(AppCopy.whatsNewTitle, style: textTheme.titleMedium),
          const SizedBox(height: 8),
          for (final entry in surface.changelog) _ChangelogTile(entry: entry),
        ],
      ),
    );
  }
}

class _PlaceholderBody extends StatelessWidget {
  const _PlaceholderBody({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: kPlaceholderMaxWidth),
        child: ListView(padding: const EdgeInsets.all(24), children: children),
      ),
    );
  }
}

class _VersionLines extends StatelessWidget {
  const _VersionLines({required this.version});

  final AppVersion version;

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.bodyMedium;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('${AppCopy.versionLabel}: ${version.version}', style: style),
        Text('${AppCopy.buildLabel}: ${version.buildNumber}', style: style),
        Text('${AppCopy.commitLabel}: ${version.gitCommit}', style: style),
        Text('${AppCopy.builtLabel}: ${version.buildTime}', style: style),
      ],
    );
  }
}

class _ChangelogTile extends StatelessWidget {
  const _ChangelogTile({required this.entry});

  final ChangelogEntry entry;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${entry.version}  ·  ${entry.date}',
            style: textTheme.labelLarge,
          ),
          for (final bullet in entry.bullets)
            Text('• $bullet', style: textTheme.bodyMedium),
        ],
      ),
    );
  }
}
