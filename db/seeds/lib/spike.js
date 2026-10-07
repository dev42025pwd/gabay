// Converts one gabay_spike venue file (its bundled assets or the product owner's own
// exports, L119) into the venue model, beacons included. Data only (L34).
// Penthouse data is Modernbrands-derived: internal only, never in a release or public page (L48).
'use strict';

const { insert } = require('./db');
const geo = require('./geo');

const CATEGORY = { books: 'BOOKS', food: 'DINING', fashion: 'FASHION', tech: 'ELECTRONICS', services: 'SERVICES', other: 'OTHER' };
const OBJECT = { column: 'PILLAR', shaft: 'SHAFT', furniture: 'FURNITURE' };
// The spike marks how sure each door is; anything short of "high" waits for the admin's review (L108, L117).
const CONFIDENCE = { high: 0.9, medium: 0.6, low: 0.3 };

const bounds = (points) => {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

/**
 * @param v       the spike venue JSON
 * @param opts    { code, major }: the venue code, and the iBeacon Major its beacons use (L119:
 *                penthouse 1, MEZZ office 2). Minors stay as the spike numbers them; more beacons
 *                can be added later in the editor.
 */
async function seedSpikeVenue(client, tenantId, ids, v, opts) {
  const counts = { units: 0, openings: 0, occupants: 0, amenities: 0, objects: 0, beacons: 0, reviews: 0 };
  const { width, height } = v.extent;
  const site = [0, 0, width, height];
  const venueId = await insert(client, 'Venue', { TenantId: tenantId, Code: opts.code, Name: v.name, BoundaryGeoJson: geo.rectPolygon(site), MapUpDeg: 0 }, 'VenueId');
  const buildingId = await insert(client, 'Building', { TenantId: tenantId, VenueId: venueId, BuildingTypeId: ids.BuildingType.MAIN, Name: v.name, FootprintGeoJson: geo.rectPolygon(site) }, 'BuildingId');
  const levelId = await insert(client, 'Level', {
    TenantId: tenantId, VenueId: venueId, BuildingId: buildingId, Ordinal: 0, Name: 'Floor 1', ShortName: '1',
    WidthM: width, DepthM: height, GridCellM: v.model?.gridCellM ?? 0.5,
  }, 'LevelId');
  const base = { TenantId: tenantId, VenueId: venueId, LevelId: levelId };

  const unitOf = new Map();
  for (const r of v.rooms) {
    const [x1, y1, x2, y2] = bounds(r.points);
    const restroom = r.category === 'restroom';
    const concourse = r.category === 'concourse';
    const imdf = concourse ? 'walkway' : restroom ? 'restroom' : r.category === 'staff' ? 'nonpublic' : 'room';
    const unitId = await insert(client, 'Unit', {
      ...base, ImdfCategory: imdf, Name: r.name, ShapeKind: 'POLYGON', CenterX: geo.round((x1 + x2) / 2), CenterY: geo.round((y1 + y2) / 2),
      GeometryGeoJson: geo.pointsPolygon(r.points), IsWalkable: concourse, PassThrough: r.passThrough === true,
    }, 'UnitId');
    unitOf.set(r.id, unitId);
    counts.units++;
    if (restroom) {
      await insert(client, 'Amenity', { ...base, UnitId: unitId, AmenityTypeId: ids.AmenityType.CR, Name: r.name, X: geo.round((x1 + x2) / 2), Y: geo.round((y1 + y2) / 2) }, 'AmenityId');
      counts.amenities++;
    } else if (CATEGORY[r.category]) {
      await insert(client, 'Occupant', {
        TenantId: tenantId, VenueId: venueId, UnitId: unitId, OccupantCategoryId: ids.OccupantCategory[CATEGORY[r.category]],
        StoreStatusId: ids.StoreStatus.OPEN, Name: r.name, SearchKeywords: r.place || null,
      }, 'OccupantId');
      counts.occupants++;
    }
  }

  for (const o of v.obstacles || []) {
    const box = geo.rectBox(o.rect);
    await insert(client, 'FloorObject', {
      ...base, ObjectTypeId: ids.ObjectType[OBJECT[o.kind] || 'FURNITURE'], ShapeKind: 'BOX', CenterX: box.cx, CenterY: box.cy,
      WidthM: box.w, DepthM: box.d, RotationDeg: 0, GeometryGeoJson: geo.rectPolygon(o.rect), BlocksWalk: true,
    }, 'FloorObjectId');
    counts.objects++;
  }

  for (const d of v.doors) {
    const inner = d.rooms.find((id) => id !== 'OUTSIDE' && unitOf.has(id));
    const width = geo.round(Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]));
    // A doorway to a place the spike never drew (MEZZ "Brew Corner", "Restroom") has no room to attach to.
    const orphan = d.rooms.some((id) => id !== 'OUTSIDE' && !unitOf.has(id));
    const needsReview = orphan || (d.confidence && d.confidence !== 'high');
    await insert(client, 'Opening', {
      ...base, UnitId: inner ? unitOf.get(inner) : null, ImdfCategory: d.entrance ? 'pedestrian.principal' : d.restricted ? 'service' : 'pedestrian',
      Name: d.name || (d.restricted ? `${d.id} (staff only)` : d.id), GeometryGeoJson: geo.lineString(d.a, d.b),
      IsVenueEntrance: d.entrance === true, ClearWidthM: width, NeedsReview: needsReview, DraftConfidence: CONFIDENCE[d.confidence] ?? null,
    }, 'OpeningId');
    counts.openings++;
    if (needsReview) counts.reviews++;
    if (orphan && d.category === 'restroom') {
      await insert(client, 'Amenity', { ...base, UnitId: null, AmenityTypeId: ids.AmenityType.CR, Name: d.name, X: geo.round((d.a[0] + d.b[0]) / 2), Y: geo.round((d.a[1] + d.b[1]) / 2) }, 'AmenityId');
      counts.amenities++;
    }
  }

  const mountHeight = v.model?.beaconHeightM ?? null;
  for (const b of v.beacons) {
    await insert(client, 'Beacon', {
      ...base, X: b.x, Y: b.y, MountHeightM: b.heightM ?? mountHeight, ProximityUuid: v.spikeUuid, Major: opts.major, Minor: b.minor,
      IdentityScheme: 'IBEACON_STATIC', MeasuredPower: v.model?.rssiAt1mDbm ?? null, BeaconModelId: ids.BeaconModel.MOKO_H2,
    }, 'BeaconId');
    counts.beacons++;
  }
  return { venueId, counts };
}

module.exports = { seedSpikeVenue };
