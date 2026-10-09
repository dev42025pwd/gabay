import '../../l10n/app_localizations.dart';

/// What kind of input a column gets (standard 4.10, Appendix A.13).
///
/// The names are the ones the `schema-forms` linter checks against the
/// column's type in `db/schema.sql`, so they are not free to rename:
/// `flag` is a BOOLEAN column (a switch, never a Yes/No dropdown), `fk` a
/// foreign-key column (a single select). An email is not a kind: it is a
/// `text` column with [FieldFormat.email].
///
/// Only the kinds the Phase 2 maintenance screens use exist today. Phase 3
/// adds `memo`, `decimal`, `money`, `date`, `datetime` and `fkMulti`, with the
/// widgets and linter rows that go with each.
enum ColKind { text, integer, flag, fk }

/// A shape a `text` column's value must have, beyond its length.
enum FieldFormat { plain, email }

/// Resolves a field's label from the ARB files, in the language on screen.
typedef FieldLabel = String Function(AppLocalizations l10n);

/// One form field, described by the column it writes to (standard 4.10: the
/// schema decides, the screen does not). `SpecFormField` is the one place that
/// turns it into a widget and its validators.
///
/// `table`, `name` and `kind` must be literals, and `required`, `maxLength`,
/// `scale` and `readOnly` literals too: the `schema-forms` linter reads them
/// from the source and fails when they disagree with `db/schema.sql` (its
/// header has the exact shape). So write them as the column says:
/// `required: true` for a NOT NULL column without a default, `maxLength: n`
/// for VARCHAR(n), `scale: s` for DECIMAL(p, s).
class FieldSpec {
  const FieldSpec({
    required this.table,
    required this.name,
    required this.label,
    required this.kind,
    this.required = false,
    this.maxLength,
    this.scale,
    this.lookup,
    this.readOnly = false,
    this.format = FieldFormat.plain,
  });

  /// The schema table the column is in (the linter's join key, with [name]).
  final String table;

  /// The COLUMN name, as in `db/schema.sql`.
  final String name;

  /// The field's name on screen and for a screen reader. Wording lives in ARB.
  final FieldLabel label;

  final ColKind kind;

  /// Mirrors NOT NULL with no default. Never hand-decided.
  final bool required;

  /// Mirrors VARCHAR(n): the client must not permit what the column refuses.
  final int? maxLength;

  /// Mirrors DECIMAL(p, s). Carried so the spec has the linter's shape; no
  /// Phase 2 kind uses it.
  final int? scale;

  /// The `/api/lookups/:name` route an `fk` field's options come from. The
  /// resolver does not fetch it: the ViewModel loads the options and passes
  /// them to the field (Phase 3 adds the async picker that fetches).
  final String? lookup;

  /// Displayed, never typed: identity, audit stamps, computed columns.
  final bool readOnly;

  /// Extra shape for a `text` column; not checked against the schema.
  final FieldFormat format;
}
