/// Build identity of one surface (standard §4.8).
///
/// The shopper app and the admin page are separate version streams. Values
/// come from `--dart-define` (`APP_VERSION`, `BUILD_NUMBER` =
/// `git rev-list --count HEAD`, `GIT_COMMIT`, `BUILD_TIME`); each surface has
/// committed fallbacks for a plain `flutter run`.
///
/// The `version` fallbacks below and the top entry of that surface's
/// changelog (`changelog.dart`) move together: the pre-commit hook (slice S5)
/// stamps both, nobody edits them by hand. A test fails if they disagree.
class AppVersion {
  const AppVersion({
    required this.version,
    required this.buildNumber,
    required this.gitCommit,
    required this.buildTime,
  });

  final String version;
  final String buildNumber;
  final String gitCommit;
  final String buildTime;

  /// Committed fallbacks, stamped by the pre-commit hook (S5).
  static const String mobileFallbackVersion = '0.1.5';
  static const String adminFallbackVersion = '0.1.5';

  static const AppVersion mobile = AppVersion(
    version: String.fromEnvironment(
      'APP_VERSION',
      defaultValue: mobileFallbackVersion,
    ),
    buildNumber: String.fromEnvironment('BUILD_NUMBER', defaultValue: '0'),
    gitCommit: String.fromEnvironment('GIT_COMMIT', defaultValue: 'local'),
    buildTime: String.fromEnvironment('BUILD_TIME', defaultValue: 'unknown'),
  );

  static const AppVersion admin = AppVersion(
    version: String.fromEnvironment(
      'APP_VERSION',
      defaultValue: adminFallbackVersion,
    ),
    buildNumber: String.fromEnvironment('BUILD_NUMBER', defaultValue: '0'),
    gitCommit: String.fromEnvironment('GIT_COMMIT', defaultValue: 'local'),
    buildTime: String.fromEnvironment('BUILD_TIME', defaultValue: 'unknown'),
  );
}
