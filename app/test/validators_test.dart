import 'package:flutter_test/flutter_test.dart';
import 'package:gabay/l10n/app_localizations.dart';
import 'package:gabay/shared/utils/validators.dart';

import 'support/shell_harness.dart';

void main() {
  late AppLocalizations l10n;
  setUpAll(() async => l10n = await loadEnglish());

  group('Validators.required', () {
    test('names the field in the message', () {
      final validate = Validators.required(l10n, 'Venue name');
      final expected = l10n.validatorRequired('Venue name');
      expect(expected, contains('Venue name'));
      expect(validate(null), expected);
      expect(validate(''), expected);
      expect(validate('   '), expected);
    });

    test('accepts any non-blank value', () {
      expect(Validators.required(l10n, 'Venue name')('Aurora'), isNull);
    });
  });

  group('Validators.maxLength', () {
    test('fails past the limit, naming the field and the limit', () {
      final message = Validators.maxLength(l10n, 'Code', 3)('abcd');
      expect(message, l10n.validatorTooLong('Code', 3));
      expect(message, allOf(contains('Code'), contains('3')));
    });

    test('accepts the limit, empty and null', () {
      final validate = Validators.maxLength(l10n, 'Code', 3);
      expect(validate('abc'), isNull);
      expect(validate(''), isNull);
      expect(validate(null), isNull);
    });
  });

  group('Validators.combine', () {
    late FieldValidator validate;
    setUp(() {
      validate = Validators.combine([
        Validators.required(l10n, 'Code'),
        Validators.maxLength(l10n, 'Code', 3),
      ]);
    });

    test('returns the first failing message, in order', () {
      expect(validate(''), l10n.validatorRequired('Code'));
      expect(validate('abcd'), l10n.validatorTooLong('Code', 3));
    });

    test('returns null when every validator passes', () {
      expect(validate('abc'), isNull);
    });

    test('an empty list accepts everything', () {
      expect(Validators.combine(const [])(null), isNull);
    });
  });
}
