import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';
import 'api_client.dart';

/// The API base URL. `main_*.dart` resolves it before `runApp` (so a release
/// build without `API_BASE` fails at launch) and overrides this provider.
final Provider<String> apiBaseUrlProvider = Provider<String>(
  (ref) => AppConfig.apiBaseUrl,
);

/// Phase 2 slot: the signed-in user's access token. Phase 1 has no sign-in.
final Provider<String?> sessionTokenProvider = Provider<String?>((ref) => null);

/// Phase 2 slot: the active tenant id.
final Provider<String?> activeTenantIdProvider = Provider<String?>(
  (ref) => null,
);

/// Phase 2 slot: what to do after a 401 (end the session, go to sign-in).
final Provider<void Function()> unauthenticatedHandlerProvider =
    Provider<void Function()>((ref) => () {});

/// The one [ApiClient]. The three callbacks are assigned here, once, and read
/// the providers above at call time (`ref.read`), so a token rotation re-binds
/// without rebuilding the client or dropping requests in flight.
final Provider<ApiClient> apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(baseUrl: ref.watch(apiBaseUrlProvider))
    ..tokenProvider = (() => ref.read(sessionTokenProvider))
    ..tenantIdProvider = (() => ref.read(activeTenantIdProvider))
    ..onUnauthenticated = (() => ref.read(unauthenticatedHandlerProvider)());
});
