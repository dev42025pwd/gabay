import 'package:flutter_test/flutter_test.dart';
import 'package:gabay/shared/utils/validators.dart';

void main() {
  group('Validators.required', () {
    final validate = Validators.required('Venue name');

    test('names the field in the message', () {
      expect(validate(null), 'Venue name is required.');
      expect(validate(''), 'Venue name is required.');
      expect(validate('   '), 'Venue name is required.');
    });

    test('accepts any non-blank value', () {
      expect(validate('Aurora'), isNull);
    });
  });

  group('Validators.maxLength', () {
    final validate = Validators.maxLength('Code', 3);

    test('fails past the limit, naming the field and the limit', () {
      expect(validate('abcd'), 'Code must be at most 3 characters.');
    });

    test('accepts the limit, empty and null', () {
      expect(validate('abc'), isNull);
      expect(validate(''), isNull);
      expect(validate(null), isNull);
    });
  });

  group('Validators.combine', () {
    final validate = Validators.combine([
      Validators.required('Code'),
      Validators.maxLength('Code', 3),
    ]);

    test('returns the first failing message, in order', () {
      expect(validate(''), 'Code is required.');
      expect(validate('abcd'), 'Code must be at most 3 characters.');
    });

    test('returns null when every validator passes', () {
      expect(validate('abc'), isNull);
    });

    test('an empty list accepts everything', () {
      expect(Validators.combine(const [])(null), isNull);
    });
  });
}
