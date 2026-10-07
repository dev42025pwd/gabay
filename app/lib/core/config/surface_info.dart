import '../copy/app_copy.dart';
import 'app_version.dart';
import 'changelog.dart';

/// The two shipped surfaces, one `main_<surface>.dart` each (standard §4.1).
enum AppSurface { mobile, admin }

/// Everything a root needs to know about the surface it is running as.
class SurfaceInfo {
  const SurfaceInfo({
    required this.surface,
    required this.displayName,
    required this.version,
    required this.changelog,
  });

  final AppSurface surface;
  final String displayName;
  final AppVersion version;
  final List<ChangelogEntry> changelog;

  static const SurfaceInfo mobile = SurfaceInfo(
    surface: AppSurface.mobile,
    displayName: AppCopy.mobileSurfaceName,
    version: AppVersion.mobile,
    changelog: mobileChangelog,
  );

  static const SurfaceInfo admin = SurfaceInfo(
    surface: AppSurface.admin,
    displayName: AppCopy.adminSurfaceName,
    version: AppVersion.admin,
    changelog: adminChangelog,
  );
}
