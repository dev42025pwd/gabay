/// The lookups the admin client may read, one per entry of the server's
/// allow-list (`GET /api/lookups/:name`, plan/FF0-dev-stub-lookups.md section
/// 3). A call site names one of these, never a free string, so a misspelt name
/// is a compile error and not a 404 at run time.
///
/// These are the names of routes, not option lists: the options themselves are
/// rows in the database (rule 5), and a client cannot add one. Each later
/// slice adds its own name in one line, together with the same line in the
/// server's allow-list (for example `connector-types` in FF-10).
enum LookupName {
  buildingTypes('building-types'),
  amenityTypes('amenity-types'),
  transitTypes('transit-types');

  const LookupName(this.path);

  /// The name as the route spells it, one URL segment.
  final String path;
}
