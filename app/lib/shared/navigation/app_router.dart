import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../components/surface_screens.dart';

/// The one router. Path URLs on the admin web page come from
/// `usePathUrlStrategy()` in `main_admin.dart`; the routes are the same on
/// both surfaces and carry no `kIsWeb` fork.
///
/// Phase 1 has two placeholder routes. The single `redirect` guard, the
/// `ShellRoute` and the `RouteObserver` of standard 4.5 arrive with sign-in
/// (Phase 2) and the first list (Phase 3).
final Provider<GoRouter> routerProvider = Provider<GoRouter>((ref) {
  final router = GoRouter(
    routes: [
      GoRoute(
        path: SurfaceHomeScreen.path,
        builder: (context, state) => const SurfaceHomeScreen(),
      ),
      GoRoute(
        path: SurfaceAboutScreen.path,
        builder: (context, state) => const SurfaceAboutScreen(),
      ),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});
