import '../../l10n/app_localizations.dart';
import 'app_version.dart';
import 'changelog.dart';

/// The two shipped surfaces, one `main_<surface>.dart` each (standard §4.1).
enum AppSurface { mobile, admin }

/// Everything a root needs to know about the surface it is running as.
class SurfaceInfo {
  const SurfaceInfo({
    required this.surface,
    required this.version,
    required this.changelog,
  });

  final AppSurface surface;
  final AppVersion version;
  final List<ChangelogEntry> changelog;

  /// The surface's name as shown to people, from ARB.
  String displayName(AppLocalizations l10n) => switch (surface) {
    AppSurface.mobile => l10n.surfaceMobileName,
    AppSurface.admin => l10n.surfaceAdminName,
  };

  static const SurfaceInfo mobile = SurfaceInfo(
    surface: AppSurface.mobile,
    version: AppVersion.mobile,
    changelog: mobileChangelog,
  );

  static const SurfaceInfo admin = SurfaceInfo(
    surface: AppSurface.admin,
    version: AppVersion.admin,
    changelog: adminChangelog,
  );
}
