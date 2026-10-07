import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'surface_info.dart';

/// Which surface this process is. Each `main_<surface>.dart` overrides it at
/// its `ProviderScope`; reading it without an override is a programming
/// error, never a silent default.
final Provider<SurfaceInfo> surfaceProvider = Provider<SurfaceInfo>(
  (ref) => throw StateError(
    'surfaceProvider must be overridden at the root ProviderScope.',
  ),
);
