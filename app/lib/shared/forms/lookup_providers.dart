import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/network_providers.dart';
import 'lookup_service.dart';

/// The one [LookupService], over the one `ApiClient`. A ViewModel reads it and
/// builds its field's fetcher: `ref.read(lookupServiceProvider).lookupFetcher(
/// LookupName.buildingTypes)`; a view never calls it.
final Provider<LookupService> lookupServiceProvider = Provider<LookupService>(
  (ref) => LookupService(ref.watch(apiClientProvider)),
);
