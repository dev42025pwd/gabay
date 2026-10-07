import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

/// Header carrying the active tenant (mall operator) id. DESIGN CHOICE
/// plan/PH1-rails.md DC-3: named for what Gabay's tenants are.
const String kTenantHeader = 'X-Tenant-Id';

/// Default sign-in paths the 401 handler must not intercept (A.11): empty.
/// Firebase Auth signs users in without calling our API (Blueprint 2.4), so
/// no API path is a sign-in path and every 401 means an expired session. A
/// path that ever is one is passed to the constructor's [signInPaths].
const List<String> kDefaultSignInPaths = <String>[];

const Duration kConnectTimeout = Duration(seconds: 10);
const Duration kReceiveTimeout = Duration(seconds: 30);

/// The ONE HTTP client (standard §4.3, A.11).
///
/// - One [Dio] instance, owned here.
/// - The token, the tenant id and the "signed out" reaction arrive as
///   callbacks assigned once at the root. This file imports no
///   state-management package and no auth code, so Riverpod stays out of the
///   network layer.
/// - Interceptors, in order: debug-only logger, tenant + `Authorization`
///   injection (a per-call `Authorization` header wins), 401 handler.
///
/// Services take an [ApiClient], stay stateless, and rethrow the original
/// [DioException]; user-facing text comes from `formatApiError`.
class ApiClient {
  ApiClient({
    required String baseUrl,
    HttpClientAdapter? adapter,
    bool? debugLogging,
    this.signInPaths = kDefaultSignInPaths,
  }) : dio = Dio(
         BaseOptions(
           baseUrl: baseUrl,
           connectTimeout: kConnectTimeout,
           receiveTimeout: kReceiveTimeout,
           headers: const {'Accept': 'application/json'},
         ),
       ) {
    if (adapter != null) dio.httpClientAdapter = adapter;
    if (debugLogging ?? kDebugMode) dio.interceptors.add(_logger());
    dio.interceptors.add(_injectHeaders());
    dio.interceptors.add(_handleUnauthenticated());
  }

  /// Exposed for tests and for services that need a download or upload with
  /// progress; ordinary calls use [get], [post], [put], [patch], [delete].
  final Dio dio;

  /// Paths on which a 401 is a normal sign-in failure, not an expired session.
  final List<String> signInPaths;

  /// Current access token, or null when signed out. Assigned once at the root.
  String? Function()? tokenProvider;

  /// Active tenant id, or null. Assigned once at the root.
  String? Function()? tenantIdProvider;

  /// Called on a 401 outside [signInPaths]. Assigned once at the root.
  VoidCallback? onUnauthenticated;

  Future<Response<T>> get<T>(
    String path, {
    Map<String, Object?>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) => dio.get<T>(
    path,
    queryParameters: queryParameters,
    options: options,
    cancelToken: cancelToken,
  );

  Future<Response<T>> post<T>(
    String path, {
    Object? data,
    Map<String, Object?>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) => dio.post<T>(
    path,
    data: data,
    queryParameters: queryParameters,
    options: options,
    cancelToken: cancelToken,
  );

  Future<Response<T>> put<T>(
    String path, {
    Object? data,
    Map<String, Object?>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) => dio.put<T>(
    path,
    data: data,
    queryParameters: queryParameters,
    options: options,
    cancelToken: cancelToken,
  );

  Future<Response<T>> patch<T>(
    String path, {
    Object? data,
    Map<String, Object?>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) => dio.patch<T>(
    path,
    data: data,
    queryParameters: queryParameters,
    options: options,
    cancelToken: cancelToken,
  );

  Future<Response<T>> delete<T>(
    String path, {
    Object? data,
    Map<String, Object?>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) => dio.delete<T>(
    path,
    data: data,
    queryParameters: queryParameters,
    options: options,
    cancelToken: cancelToken,
  );

  /// Debug-only. Logs method, path and status only: never headers or bodies,
  /// so a token or a personal detail cannot reach a log.
  Interceptor _logger() => InterceptorsWrapper(
    onRequest: (options, handler) {
      debugPrint('-> ${options.method} ${options.uri.path}');
      handler.next(options);
    },
    onResponse: (response, handler) {
      debugPrint(
        '<- ${response.statusCode} ${response.requestOptions.uri.path}',
      );
      handler.next(response);
    },
    onError: (error, handler) {
      debugPrint(
        '<- ${error.response?.statusCode ?? error.type.name} '
        '${error.requestOptions.uri.path}',
      );
      handler.next(error);
    },
  );

  Interceptor _injectHeaders() => InterceptorsWrapper(
    onRequest: (options, handler) {
      final tenantId = tenantIdProvider?.call();
      final token = tokenProvider?.call();
      if (tenantId != null && tenantId.isNotEmpty) {
        options.headers[kTenantHeader] = tenantId;
      }
      final hasOwnAuthorization = options.headers.keys.any(
        (name) => name.toLowerCase() == 'authorization',
      );
      if (token != null && token.isNotEmpty && !hasOwnAuthorization) {
        options.headers['Authorization'] = 'Bearer $token';
      }
      handler.next(options);
    },
  );

  Interceptor _handleUnauthenticated() => InterceptorsWrapper(
    onError: (error, handler) {
      final path = error.requestOptions.path;
      final isSignIn = signInPaths.any(path.contains);
      if (error.response?.statusCode == 401 && !isSignIn) {
        onUnauthenticated?.call();
        // Deliberately neither handler.next() nor handler.resolve(): the
        // request's Future freezes, so a widget the router has already
        // disposed cannot call setState on a dead element (standard A.11).
        return;
      }
      handler.next(error);
    },
  );
}
