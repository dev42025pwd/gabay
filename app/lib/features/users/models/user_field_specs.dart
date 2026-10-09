import '../../../shared/forms/field_spec.dart';

// The users form's fields, one FieldSpec per column (rule 7). The `schema-forms`
// linter checks each against db/schema.sql: change a column there and this file
// fails the check until the spec says the same. S11 builds the screens on these.

/// AppUser.Email: VARCHAR(254) NOT NULL.
final FieldSpec appUserEmail = FieldSpec(
  table: 'AppUser',
  name: 'Email',
  label: (l10n) => l10n.fieldAppUserEmail,
  kind: ColKind.text,
  required: true,
  maxLength: 254,
  format: FieldFormat.email,
);

/// AppUser.DisplayName: VARCHAR(120) NOT NULL.
final FieldSpec appUserDisplayName = FieldSpec(
  table: 'AppUser',
  name: 'DisplayName',
  label: (l10n) => l10n.fieldAppUserDisplayName,
  kind: ColKind.text,
  required: true,
  maxLength: 120,
);

/// AppUser.IsActive: BOOLEAN NOT NULL DEFAULT TRUE (so `required` may be either).
final FieldSpec appUserIsActive = FieldSpec(
  table: 'AppUser',
  name: 'IsActive',
  label: (l10n) => l10n.fieldAppUserIsActive,
  kind: ColKind.flag,
);

/// UserRole.RoleId: INT NOT NULL, a foreign key to Role. A user holds several
/// roles through UserRole rows, so S11's form adds one row per choice.
final FieldSpec userRoleRole = FieldSpec(
  table: 'UserRole',
  name: 'RoleId',
  label: (l10n) => l10n.fieldUserRoleRole,
  kind: ColKind.fk,
  required: true,
  lookup: 'roles',
);
