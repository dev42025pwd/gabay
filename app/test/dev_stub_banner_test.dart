import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gabay/core/config/app_config.dart';
import 'package:gabay/core/config/dev_stub_provider.dart';
import 'package:gabay/core/config/surface_info.dart';
import 'package:gabay/core/config/surface_provider.dart';
import 'package:gabay/core/network/network_providers.dart';
import 'package:gabay/l10n/app_localizations.dart';
import 'package:gabay/shared/components/dev_stub_banner.dart';
import 'package:gabay/shared/navigation/gabay_app.dart';

import 'support/forms_harness.dart';
import 'support/shell_harness.dart';

/// FF-0 (plan/FF0-dev-stub-lookups.md sections 4 and 5, E-20): the "Development
/// build: no sign-in" banner at the top of the admin page. Shown when the build
/// is not a release build, or when it was built with DEV_STUB=true; never on the
/// shopper app. It has a screen-reader name, takes its colours from the theme's
/// colour scheme, and does not overflow at text size x1.4 on a 320 px phone.
void main() {
  late AppLocalizations l10n;
  setUpAll(() async => l10n = await loadEnglish());

  group('AppConfig.showsDevStubBanner', () {
    test('a debug or profile build shows it', () {
      expect(
        AppConfig.showsDevStubBanner(releaseMode: false, devStubDefine: false),
        isTrue,
      );
    });

    test('a release build shows it only when built with DEV_STUB=true', () {
      expect(
        AppConfig.showsDevStubBanner(releaseMode: true, devStubDefine: false),
        isFalse,
      );
      expect(
        AppConfig.showsDevStubBanner(releaseMode: true, devStubDefine: true),
        isTrue,
      );
    });

    test('the define is off when the build does not pass it', () {
      expect(AppConfig.devStubDefine, isFalse);
    });
  });

  Widget app(SurfaceInfo surface, {bool? visibleOverride}) => ProviderScope(
    overrides: [
      surfaceProvider.overrideWithValue(surface),
      apiBaseUrlProvider.overrideWithValue('http://api.test.invalid'),
      if (visibleOverride != null)
        devStubBannerVisibleProvider.overrideWithValue(visibleOverride),
    ],
    child: const GabayApp(),
  );

  group('where it shows', () {
    testWidgets('the admin page shows it, above the page content', (
      tester,
    ) async {
      setLogicalSize(tester, const Size(390, 844));
      await tester.pumpWidget(app(SurfaceInfo.admin));
      await tester.pumpAndSettle();

      expect(find.text(l10n.devStubBanner), findsOneWidget);
      final banner = tester.getTopLeft(find.byType(DevStubBanner));
      final appBar = tester.getTopLeft(find.byType(AppBar));
      expect(banner.dy, 0);
      expect(banner.dy, lessThan(appBar.dy));
      expect(tester.getSize(find.byType(DevStubBanner)).width, 390);
    });

    testWidgets('it stays on every admin route, About included', (
      tester,
    ) async {
      setLogicalSize(tester, const Size(390, 844));
      await tester.pumpWidget(app(SurfaceInfo.admin));
      await tester.pumpAndSettle();
      await tester.tap(find.text(l10n.aboutAction));
      await tester.pumpAndSettle();
      expect(find.text(l10n.aboutTitle), findsOneWidget);
      expect(find.text(l10n.devStubBanner), findsOneWidget);
    });

    testWidgets('the shopper app never shows it', (tester) async {
      setLogicalSize(tester, const Size(390, 844));
      await tester.pumpWidget(app(SurfaceInfo.mobile));
      await tester.pumpAndSettle();
      expect(find.byType(DevStubBanner), findsNothing);
      expect(find.text(l10n.devStubBanner), findsNothing);
    });

    testWidgets('an admin build that should not show it (release, no define) '
        'has no banner', (tester) async {
      setLogicalSize(tester, const Size(390, 844));
      await tester.pumpWidget(app(SurfaceInfo.admin, visibleOverride: false));
      await tester.pumpAndSettle();
      expect(find.byType(DevStubBanner), findsNothing);
      expect(find.text(l10n.aboutAction), findsOneWidget);
    });
  });

  group('how it looks and reads', () {
    testWidgets('has a screen-reader name', (tester) async {
      final handle = tester.ensureSemantics();
      setLogicalSize(tester, const Size(390, 844));
      await tester.pumpWidget(app(SurfaceInfo.admin));
      await tester.pumpAndSettle();
      expect(find.bySemanticsLabel(l10n.devStubBanner), findsOneWidget);
      handle.dispose();
    });

    for (final brightness in Brightness.values) {
      testWidgets('uses the colour scheme in ${brightness.name} mode', (
        tester,
      ) async {
        setLogicalSize(tester, const Size(390, 844));
        tester.platformDispatcher.platformBrightnessTestValue = brightness;
        addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
        await tester.pumpWidget(app(SurfaceInfo.admin));
        await tester.pumpAndSettle();

        final scheme = Theme.of(tester.element(find.byType(DevStubBanner)))
            .colorScheme;
        final surface = tester.widget<Material>(
          find.descendant(
            of: find.byType(DevStubBanner),
            matching: find.byType(Material),
          ),
        );
        expect(surface.color, scheme.tertiaryContainer);
        expect(
          DefaultTextStyle.of(tester.element(find.text(l10n.devStubBanner)))
              .style
              .color,
          scheme.onTertiaryContainer,
        );
        final icon = tester.widget<Icon>(
          find.descendant(
            of: find.byType(DevStubBanner),
            matching: find.byType(Icon),
          ),
        );
        expect(icon.color, scheme.onTertiaryContainer);
      });
    }

    testWidgets('nothing overflows at text size x1.4 on a 320 px phone', (
      tester,
    ) async {
      setLogicalSize(tester, const Size(320, 640));
      tester.platformDispatcher.textScaleFactorTestValue = 1.4;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await tester.pumpWidget(app(SurfaceInfo.admin));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      // The whole text is shown: it wraps to more lines rather than clipping.
      expect(find.text(l10n.devStubBanner), findsOneWidget);
      expect(tester.getSize(find.byType(DevStubBanner)).width, 320);

      // The banner takes room, so the button is below the fold: scroll to it.
      await tester.scrollUntilVisible(find.text(l10n.aboutAction), 100);
      await tester.tap(find.text(l10n.aboutAction));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });

    testWidgets('a much longer line wraps and still fits at x1.4', (
      tester,
    ) async {
      setLogicalSize(tester, const Size(320, 640));
      await tester.pumpWidget(
        screenHarness(
          const Scaffold(
            body: DevStubBanner(
              text:
                  'Development build: no sign-in, and nothing entered here is '
                  'kept, so do not type anything real into this page at all',
            ),
          ),
          textScale: 1.4,
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(
        tester.getSize(find.byType(DevStubBanner)).height,
        greaterThan(80),
      );
    });
  });
}
