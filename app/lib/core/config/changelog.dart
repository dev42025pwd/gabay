import '../../l10n/app_localizations.dart';

/// One released version, in plain language for the people who use it.
///
/// No table names, endpoints or raw commit messages (standard §4.8). The top
/// entry's `version` and `date` are stamped by the pre-commit hook (slice S5),
/// never hand-authored. Newest first.
///
/// `version` and `date` stay in Dart (the hook edits them). The bullet text is
/// wording, so it lives in the ARB files; [bullets] reads it from the
/// [AppLocalizations] it is given.
class ChangelogEntry {
  const ChangelogEntry({
    required this.version,
    required this.date,
    required this.bullets,
  });

  final String version;

  /// ISO date, `YYYY-MM-DD`.
  final String date;

  /// The localised bullet lines for this entry.
  final List<String> Function(AppLocalizations l10n) bullets;
}

List<String> _mobile010(AppLocalizations l10n) => [
  l10n.changelogMobile_0_1_0_a,
];

List<String> _admin010(AppLocalizations l10n) => [l10n.changelogAdmin_0_1_0_a];

/// Shopper app changelog, newest first. ARB keys: `changelogMobile_<version>_<letter>`.
const List<ChangelogEntry> mobileChangelog = [
  ChangelogEntry(version: '0.1.0', date: '2026-10-07', bullets: _mobile010),
];

/// Admin page changelog, newest first. ARB keys: `changelogAdmin_<version>_<letter>`.
const List<ChangelogEntry> adminChangelog = [
  ChangelogEntry(version: '0.1.0', date: '2026-10-07', bullets: _admin010),
];
