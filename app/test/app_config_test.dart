import 'package:flutter_test/flutter_test.dart';
import 'package:gabay/core/config/app_config.dart';

void main() {
  group('AppConfig.resolveApiBaseUrl', () {
    test('debug with no define uses the local Functions emulator', () {
      expect(
        AppConfig.resolveApiBaseUrl(define: '', releaseMode: false),
        'http://127.0.0.1:5001/demo-gabay/asia-southeast1/api',
      );
    });

    test(
      'API_BASE wins over the per-mode default and loses its trailing slash',
      () {
        expect(
          AppConfig.resolveApiBaseUrl(
            define: 'https://api.example.test/api/',
            releaseMode: false,
          ),
          'https://api.example.test/api',
        );
      },
    );

    test('a release build with no API_BASE is refused, never localhost', () {
      expect(
        () => AppConfig.resolveApiBaseUrl(define: '', releaseMode: true),
        throwsA(
          isA<StateError>().having(
            (e) => e.message,
            'message',
            contains('API_BASE'),
          ),
        ),
      );
      expect(
        () => AppConfig.resolveApiBaseUrl(define: '   ', releaseMode: true),
        throwsStateError,
      );
    });

    test('a release build pointing at this machine is refused', () {
      for (final url in [
        'http://localhost:5001/api',
        'http://127.0.0.1:5001/api',
        'http://10.0.2.2:5001/api',
        'http://[::1]:5001/api',
        'not a url',
      ]) {
        expect(
          () => AppConfig.resolveApiBaseUrl(define: url, releaseMode: true),
          throwsStateError,
          reason: url,
        );
      }
    });

    test('a release build with a real https URL is accepted', () {
      expect(
        AppConfig.resolveApiBaseUrl(
          define: 'https://api.example.test/api',
          releaseMode: true,
        ),
        'https://api.example.test/api',
      );
    });
  });
}
