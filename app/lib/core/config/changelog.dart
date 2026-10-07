import '../copy/app_copy.dart';

/// One released version, in plain language for the people who use it.
///
/// No table names, endpoints or raw commit messages (standard §4.8). The top
/// entry's `version` and `date` are stamped by the pre-commit hook (slice S5),
/// never hand-authored. Newest first.
class ChangelogEntry {
  const ChangelogEntry({
    required this.version,
    required this.date,
    required this.bullets,
  });

  final String version;

  /// ISO date, `YYYY-MM-DD`.
  final String date;
  final List<String> bullets;
}

/// Shopper app changelog, newest first.
const List<ChangelogEntry> mobileChangelog = [
  ChangelogEntry(
    version: '0.1.0',
    date: '2026-10-07',
    bullets: [AppCopy.mobileFirstChangelog],
  ),
];

/// Admin page changelog, newest first.
const List<ChangelogEntry> adminChangelog = [
  ChangelogEntry(
    version: '0.1.0',
    date: '2026-10-07',
    bullets: [AppCopy.adminFirstChangelog],
  ),
];
