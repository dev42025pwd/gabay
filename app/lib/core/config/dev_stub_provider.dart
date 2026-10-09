import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app_config.dart';
import 'surface_info.dart';
import 'surface_provider.dart';

/// Whether this process shows the "Development build: no sign-in" banner
/// (E-20). Only the admin page has one: the shopper app has no stub and no
/// banner. A test overrides it to try a release build.
final Provider<bool> devStubBannerVisibleProvider = Provider<bool>(
  (ref) =>
      ref.watch(surfaceProvider).surface == AppSurface.admin &&
      AppConfig.showsDevStubBanner(
        releaseMode: kReleaseMode,
        devStubDefine: AppConfig.devStubDefine,
      ),
);
