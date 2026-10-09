import 'package:flutter/material.dart';
import 'package:gabay/core/theme/app_theme.dart';
import 'package:gabay/l10n/app_localizations.dart';
import 'package:gabay/shared/forms/field_spec.dart';

/// A localised, themed app around [child], for widget tests of the form and
/// list machinery. [textScale] raises the text size the way a user setting does.
Widget formHarness(
  Widget child, {
  double textScale = 1,
  Brightness brightness = Brightness.light,
}) => screenHarness(
  Scaffold(body: SingleChildScrollView(child: child)),
  textScale: textScale,
  brightness: brightness,
);

/// Like [formHarness], for a widget that is a whole screen (it has its own
/// Scaffold).
Widget screenHarness(
  Widget home, {
  double textScale = 1,
  Brightness brightness = Brightness.light,
}) => MaterialApp(
  theme: buildGabayTheme(brightness),
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  builder: (context, home) => MediaQuery(
    data: MediaQuery.of(context)
        .copyWith(textScaler: TextScaler.linear(textScale)),
    child: home!,
  ),
  home: home,
);

/// Test-only specs. They live in `test/`, so `schema-forms` (which reads
/// `app/lib`) never checks them against the schema.
FieldSpec testSpec({
  String label = 'Venue name',
  ColKind kind = ColKind.text,
  bool required = false,
  int? maxLength,
  bool readOnly = false,
  FieldFormat format = FieldFormat.plain,
}) => FieldSpec(
  table: 'Venue',
  name: 'Name',
  label: (_) => label,
  kind: kind,
  required: required,
  maxLength: maxLength,
  readOnly: readOnly,
  format: format,
);
