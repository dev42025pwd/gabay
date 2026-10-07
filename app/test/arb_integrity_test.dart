import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:gabay/core/config/changelog.dart';

import 'support/shell_harness.dart';

/// Integrity of the ARB files, read from disk (not through the generated
/// class): no duplicate keys, every locale file has every key of the template,
/// and every changelog entry maps to existing, version-neutral keys.

const String _arbDir = 'lib/l10n';
const String _template = 'app_en.arb';

/// Message and metadata keys of an ARB file, in file order, INCLUDING
/// duplicates.
///
/// `json.decode` silently keeps the last duplicate, so the raw text is scanned
/// instead. In an ARB file every message key sits at nesting depth 1 (the
/// placeholder maps are deeper), which is what "top-level" means here.
List<String> topLevelKeys(String rawJson) {
  final keys = <String>[];
  var depth = 0;
  var i = 0;
  while (i < rawJson.length) {
    final c = rawJson[i];
    if (c == '"') {
      i++;
      final buffer = StringBuffer();
      while (i < rawJson.length && rawJson[i] != '"') {
        if (rawJson[i] == r'\') {
          buffer.write(rawJson[i]);
          i++;
        }
        buffer.write(rawJson[i]);
        i++;
      }
      i++; // the closing quote
      var j = i;
      while (j < rawJson.length && ' \t\r\n'.contains(rawJson[j])) {
        j++;
      }
      final isKey = j < rawJson.length && rawJson[j] == ':';
      if (isKey && depth == 1) keys.add(buffer.toString());
      continue;
    }
    if (c == '{' || c == '[') depth++;
    if (c == '}' || c == ']') depth--;
    i++;
  }
  return keys;
}

/// Message keys only: not `@metadata` and not `@@locale`.
Set<String> messageKeys(Iterable<String> keys) =>
    keys.where((k) => !k.startsWith('@')).toSet();

void main() {
  final arbFiles = Directory(_arbDir)
      .listSync()
      .whereType<File>()
      .where((f) => f.path.endsWith('.arb'))
      .toList();

  group('ARB files', () {
    test('the template exists', () {
      expect(File('$_arbDir/$_template').existsSync(), isTrue);
    });

    test('the key scanner finds duplicates (self-check)', () {
      const sample = '{ "a": "1", "@a": { "description": "d" }, "a": "2" }';
      final keys = topLevelKeys(sample);
      expect(keys, ['a', '@a', 'a']);
      expect(keys.toSet().length, isNot(keys.length));
    });

    for (final file in arbFiles) {
      final name = file.uri.pathSegments.last;
      test('$name has no duplicate keys', () {
        final keys = topLevelKeys(file.readAsStringSync());
        final seen = <String>{};
        final duplicates = keys.where((k) => !seen.add(k)).toList();
        expect(duplicates, isEmpty, reason: 'duplicate keys: $duplicates');
      });
    }

    test('every message of the template has a @description', () {
      final keys = topLevelKeys(File('$_arbDir/$_template').readAsStringSync())
          .toSet();
      final missing = messageKeys(keys)
          .where((k) => !keys.contains('@$k'))
          .toList();
      expect(missing, isEmpty);
    });

    test('every locale file has every key of the template, and no extras', () {
      // Reads every app_<locale>.arb from disk, so a new app_tl.arb is checked
      // the moment it exists. Without this a missing key falls back to
      // English with only a status line from gen-l10n.
      final templateKeys = messageKeys(
        topLevelKeys(File('$_arbDir/$_template').readAsStringSync()),
      );
      final problems = <String>[];
      for (final file in arbFiles) {
        final name = file.uri.pathSegments.last;
        if (name == _template) continue;
        final keys = messageKeys(topLevelKeys(file.readAsStringSync()));
        final missing = templateKeys.difference(keys);
        final extra = keys.difference(templateKeys);
        if (missing.isNotEmpty) problems.add('$name lacks $missing');
        if (extra.isNotEmpty) problems.add('$name has unknown keys $extra');
      }
      expect(problems, isEmpty);
    });
  });

  group('changelogs and their ARB keys', () {
    final keyPattern = RegExp(r'^changelog(Mobile|Admin)_e(\d{3})_([a-z])$');
    late Set<String> arbKeys;
    late Map<String, Object?> arbValues;
    setUpAll(() {
      // Values only: duplicate keys are rejected by their own test above.
      arbValues = json.decode(
        File('$_arbDir/$_template').readAsStringSync(),
      ) as Map<String, Object?>;
      arbKeys = messageKeys(
        topLevelKeys(File('$_arbDir/$_template').readAsStringSync()),
      );
    });

    final surfaces = {'Mobile': mobileChangelog, 'Admin': adminChangelog};

    for (final surface in surfaces.entries) {
      group(surface.key, () {
        test('entry numbers are unique and strictly decreasing', () {
          final numbers = surface.value.map((e) => e.number).toList();
          expect(numbers.toSet().length, numbers.length, reason: '$numbers');
          for (var i = 1; i < numbers.length; i++) {
            expect(numbers[i], lessThan(numbers[i - 1]), reason: '$numbers');
          }
          expect(numbers.every((n) => n >= 1 && n <= 999), isTrue);
        });

        test('every entry references existing, version-neutral keys', () async {
          final l10n = await loadEnglish();
          for (final entry in surface.value) {
            final padded = entry.number.toString().padLeft(3, '0');
            final entryKeys = arbKeys
                .where(
                  (k) => k.startsWith('changelog${surface.key}_e${padded}_'),
                )
                .toList();
            expect(
              entryKeys,
              isNotEmpty,
              reason: 'no ARB keys for ${surface.key} entry $padded',
            );
            // The entry shows exactly the ARB text of ITS OWN keys (this surface,
            // this entry number, in letter order): a mobile entry wired to an
            // admin key, or to another entry's key, fails here.
            entryKeys.sort();
            final expected = [
              for (final key in entryKeys) arbValues[key]! as String,
            ];
            expect(
              entry.bullets(l10n),
              expected,
              reason:
                  '${surface.key} e$padded must read its own keys $entryKeys',
            );
          }
        });

        test('no ARB changelog key is orphaned or carries a version', () {
          final numbers = surface.value
              .map((e) => e.number.toString().padLeft(3, '0'))
              .toSet();
          final mine = arbKeys.where(
            (k) => k.startsWith('changelog${surface.key}_'),
          );
          for (final key in mine) {
            final match = keyPattern.firstMatch(key);
            expect(match, isNotNull, reason: '$key is not changelog…_e###_x');
            expect(numbers, contains(match!.group(2)), reason: '$key orphaned');
          }
        });
      });
    }
  });
}
