import 'package:flutter/foundation.dart';

enum AppMessageKind { error, success }

/// One message on the ONE messaging surface (standard §4.6).
@immutable
class AppMessage {
  const AppMessage({required this.id, required this.kind, required this.text});

  /// Increases with every message, so an auto-dismiss timer never clears a
  /// newer message that replaced the one it was started for.
  final int id;
  final AppMessageKind kind;
  final String text;
}
