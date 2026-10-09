import 'package:flutter_test/flutter_test.dart';
import 'package:gabay/l10n/app_localizations.dart';
import 'package:gabay/shared/forms/field_spec.dart';
import 'package:gabay/shared/forms/field_validators.dart';
import 'package:gabay/shared/utils/validators.dart';

import '../support/forms_harness.dart';
import '../support/shell_harness.dart';

/// The two validators S9 adds to `Validators`, and the derivation of a field's
/// validator list from its spec. (`validators_test.dart` is unchanged.)
void main() {
  late AppLocalizations l10n;
  setUpAll(() async => l10n = await loadEnglish());

  group('Validators.integer', () {
    test('accepts whole numbers, negatives, blank and null', () {
      final validate = Validators.integer(l10n, 'Floor');
      for (final ok in ['0', '12', '-3', '', null, '  ']) {
        expect(validate(ok), isNull, reason: '"$ok"');
      }
    });

    test('refuses anything else, naming the field', () {
      final validate = Validators.integer(l10n, 'Floor');
      for (final bad in ['-', '1.5', '1a', '--2', '99999999999999999999']) {
        expect(validate(bad), l10n.validatorNotInteger('Floor'), reason: bad);
      }
      expect(l10n.validatorNotInteger('Floor'), contains('Floor'));
    });
  });

  group('Validators.email', () {
    test('accepts an address, blank and null', () {
      final validate = Validators.email(l10n, 'Email');
      for (final ok in ['ana@example.com', 'a.b+c@mall.ph', '', null]) {
        expect(validate(ok), isNull, reason: '"$ok"');
      }
    });

    test('refuses what is not an address, naming the field', () {
      final validate = Validators.email(l10n, 'Email');
      for (final bad in ['ana', 'ana@', '@example.com', 'a b@c.d', 'a@b']) {
        expect(validate(bad), l10n.validatorNotEmail('Email'), reason: bad);
      }
      expect(l10n.validatorNotEmail('Email'), contains('Email'));
    });
  });

  group('validatorFor (derived from the spec, never authored)', () {
    test('required and maxLength come from the spec, in that order', () {
      final validate = validatorFor(
        testSpec(required: true, maxLength: 3),
        l10n,
      );
      expect(validate(''), l10n.validatorRequired('Venue name'));
      expect(validate('abcd'), l10n.validatorTooLong('Venue name', 3));
      expect(validate('abc'), isNull);
    });

    test('a plain optional text field accepts anything', () {
      expect(validatorFor(testSpec(), l10n)(null), isNull);
    });

    test('email format and integer kind add their own check', () {
      final email = validatorFor(
        testSpec(label: 'Email', format: FieldFormat.email),
        l10n,
      );
      expect(email('nope'), l10n.validatorNotEmail('Email'));
      final integer = validatorFor(
        testSpec(label: 'Floor', kind: ColKind.integer),
        l10n,
      );
      expect(integer('x'), l10n.validatorNotInteger('Floor'));
    });

    test('a read-only spec has no validators', () {
      final validate = validatorFor(
        testSpec(required: true, maxLength: 1, readOnly: true),
        l10n,
      );
      expect(validate(''), isNull);
      expect(validate('long'), isNull);
    });
  });
}
