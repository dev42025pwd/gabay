import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../l10n/app_localizations.dart';
import '../utils/validators.dart';
import 'field_spec.dart';
import 'field_validators.dart';
import 'select_option.dart';

/// The ONE resolver (standard 4.10, A.13): turns a [FieldSpec] into its widget
/// and validators. This folder is the only place a `TextFormField` may be
/// built (rule 7, `no-bare-textfield`); a view declares specs and places this.
///
/// The value is held by the caller's ViewModel, not here: it goes in through
/// [value] and comes out through [onChanged], typed by kind:
///
/// | kind | value | widget |
/// |---|---|---|
/// | `text` | `String` | single-line text (email keyboard for `FieldFormat.email`) |
/// | `integer` | `int?` (`null` when blank) | digits-only text, number keyboard |
/// | `flag` | `bool` | a switch |
/// | `fk` | the chosen [SelectOption.value] | a dropdown over [options] |
///
/// A `readOnly` spec renders its value as plain text (a disabled switch for a
/// flag), builds no input, and is never validated.
class SpecFormField extends StatelessWidget {
  const SpecFormField({
    required this.spec,
    required this.value,
    required this.onChanged,
    this.options = const [],
    super.key,
  });

  final FieldSpec spec;
  final Object? value;
  final ValueChanged<Object?> onChanged;

  /// The choices of an `fk` field, loaded by the ViewModel from
  /// `/api/lookups/:name`.
  final List<SelectOption> options;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final label = spec.label(l10n);
    final validator = validatorFor(spec, l10n);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: switch (spec.kind) {
        ColKind.flag => _flag(label),
        _ when spec.readOnly => _readOnly(label),
        ColKind.text => _text(label, validator),
        ColKind.integer => _integer(label, validator),
        ColKind.fk => _select(label, validator),
      },
    );
  }

  Widget _flag(String label) => SwitchListTile(
    contentPadding: EdgeInsets.zero,
    title: Text(label),
    value: value == true,
    // Null disables the switch: a read-only flag is shown, never toggled.
    onChanged: spec.readOnly ? null : onChanged,
  );

  Widget _text(String label, FieldValidator validator) => TextFormField(
    initialValue: value?.toString(),
    decoration: InputDecoration(labelText: label),
    keyboardType: spec.format == FieldFormat.email
        ? TextInputType.emailAddress
        : TextInputType.text,
    autovalidateMode: AutovalidateMode.onUserInteraction,
    validator: validator,
    onChanged: onChanged,
  );

  /// Digits and a minus sign only, and a blank or malformed text reports
  /// `null`: nothing here can throw on what the user typed (standard 4.10).
  Widget _integer(String label, FieldValidator validator) => TextFormField(
    initialValue: value?.toString(),
    decoration: InputDecoration(labelText: label),
    keyboardType: const TextInputType.numberWithOptions(signed: true),
    inputFormatters: [FilteringTextInputFormatter.allow(RegExp('[0-9-]'))],
    autovalidateMode: AutovalidateMode.onUserInteraction,
    validator: validator,
    onChanged: (text) => onChanged(int.tryParse(text.trim())),
  );

  Widget _select(String label, FieldValidator validator) {
    // A value the options do not list is left unselected, never asserted on.
    final listed = options.any((o) => o.value == value);
    return DropdownButtonFormField<Object>(
      initialValue: listed ? value : null,
      isExpanded: true,
      decoration: InputDecoration(labelText: label),
      autovalidateMode: AutovalidateMode.onUserInteraction,
      validator: (chosen) => validator(chosen?.toString()),
      items: [
        for (final option in options)
          DropdownMenuItem<Object>(
            value: option.value,
            child: Text(option.label, overflow: TextOverflow.ellipsis),
          ),
      ],
      onChanged: onChanged,
    );
  }

  Widget _readOnly(String label) {
    final shown = spec.kind == ColKind.fk
        ? options.where((o) => o.value == value).firstOrNull?.label
        : null;
    final text = shown ?? value?.toString() ?? '';
    return Semantics(
      container: true,
      readOnly: true,
      label: label,
      value: text,
      child: ExcludeSemantics(
        child: InputDecorator(
          decoration: InputDecoration(labelText: label),
          child: Text(text),
        ),
      ),
    );
  }
}
