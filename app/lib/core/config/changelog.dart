import '../../l10n/app_localizations.dart';

/// One released version, in plain language for the people who use it.
///
/// No table names, endpoints or raw commit messages (standard §4.8). The top
/// entry's `version` and `date` are stamped by the pre-commit hook (slice S5),
/// never hand-authored. Newest first.
///
/// `version` and `date` stay in Dart (the hook edits them). The bullet text is
/// wording, so it lives in the ARB files, under keys that do NOT contain the
/// version: `changelog<Surface>_e<number>_<letter>`, for example
/// `changelogMobile_e001_a`. [number] is a running entry number per surface:
/// the first mobile entry ever is 1; a number is never reused and its keys are
/// never renamed, so the hook can restamp a version without touching ARB.
class ChangelogEntry {
  const ChangelogEntry({
    required this.number,
    required this.version,
    required this.date,
    required this.bullets,
  });

  /// Running entry number within the surface, from 1; the newest is highest.
  final int number;

  final String version;

  /// ISO date, `YYYY-MM-DD`.
  final String date;

  /// The localised bullet lines for this entry.
  final List<String> Function(AppLocalizations l10n) bullets;
}

List<String> _mobileE001(AppLocalizations l10n) => [
  l10n.changelogMobile_e001_a,
];

List<String> _adminE001(AppLocalizations l10n) => [l10n.changelogAdmin_e001_a];

/// Shopper app changelog, newest first.
/// ARB keys: `changelogMobile_e<number>_<letter>`.
const List<ChangelogEntry> mobileChangelog = [
  ChangelogEntry(
    number: 1,
    version: '0.1.2',
    date: '2026-10-09',
    bullets: _mobileE001,
  ),
];

/// Admin page changelog, newest first.
/// ARB keys: `changelogAdmin_e<number>_<letter>`.
const List<ChangelogEntry> adminChangelog = [
  ChangelogEntry(
    number: 1,
    version: '0.1.2',
    date: '2026-10-09',
    bullets: _adminE001,
  ),
];
