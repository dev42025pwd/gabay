// Converts one Gabay Demo venue (a JSON dump of the demo's own generator, L119) into
// the venue model. Data only: nothing of the demo's code is used here (L34).
'use strict';

const { insert } = require('./db');
const { ensureLookup } = require('./lookups');
const geo = require('./geo');

const STATUS = { open: 'OPEN', closed: 'CLOSED', maintenance: 'BEING_REPAIRED', comingSoon: 'OPENING_SOON' };
const CATEGORY = { fashion: 'FASHION', food: 'DINING', tech: 'ELECTRONICS', books: 'BOOKS', services: 'SERVICES', other: 'OTHER', cinema: 'CINEMA', arena: 'ENTERTAINMENT', garden: 'LEISURE' };
const AMENITY = { restroom: 'CR', atm: 'ATM', info: 'INFO', ev: 'EV_CHARGING' };
const CONNECTOR = { lift: 'ELEVATOR', stairs: 'STAIRS', escalator: 'ESCALATOR', ramp: 'RAMP' };
// The demo's building kinds; those with no platform type become this tenant's own rows (rule 5).
const BUILDING_KIND = { mall: 'MAIN', tower: 'MAIN', parking: 'PARKING', openair: 'OPEN_AIR', arena: 'ARENA', station: 'STATION' };
const TENANT_BUILDING_TYPES = { OPEN_AIR: 'Open-air wing', ARENA: 'Arena', STATION: 'Station' };
const AREA_UNIT = { void: ['opentobelow', false], court: ['walkway', true], plaza: ['walkway', true], garden: ['unenclosedarea', true], boh: ['nonpublic', false], bowl: ['recreation', false], portal: ['unspecified', false] };
const SLOT_UNIT = { core: 'structure', portal: 'unspecified' };
const RENAMES = [[/IMAX/g, 'Vista Max']]; // L119: no real trademarks in test data

const rename = (s) => RENAMES.reduce((acc, [re, to]) => (acc ? acc.replace(re, to) : acc), s);

async function seedDemoVenue(client, tenantId, ids, v) {
  const counts = { levels: 0, units: 0, openings: 0, occupants: 0, amenities: 0, connectors: 0, stops: 0 };
  const [sx1, sy1, sx2, sy2] = v.siteRect;
  const venueId = await insert(client, 'Venue', {
    TenantId: tenantId, Code: v.id.toUpperCase(), Name: v.name, BoundaryGeoJson: geo.rectPolygon(v.siteRect), MapUpDeg: 0,
  }, 'VenueId');

  // Buildings, and one level per building per demo level it has (L30: levels belong to buildings).
  const levelOf = new Map(); // `${bld}|${lv}` -> LevelId
  const buildings = [];
  for (const b of v.buildings) {
    const code = BUILDING_KIND[b.kind] || 'MAIN';
    const typeId = ids.BuildingType[code] ?? await ensureLookup(client, 'BuildingType', tenantId, { Code: code, Label: TENANT_BUILDING_TYPES[code] });
    const buildingId = await insert(client, 'Building', { TenantId: tenantId, VenueId: venueId, BuildingTypeId: typeId, Name: b.name, FootprintGeoJson: geo.rectPolygon(b.rect) }, 'BuildingId');
    buildings.push({ ...b, buildingId });
    for (const lv of b.lvs) {
      const L = v.levels[lv];
      levelOf.set(`${b.id}|${lv}`, await insert(client, 'Level', {
        TenantId: tenantId, VenueId: venueId, BuildingId: buildingId, Ordinal: lv - v.ground, Name: L.name, ShortName: L.short,
        ElevationM: L.elev, WidthM: sx2 - sx1, DepthM: sy2 - sy1, GridCellM: 1,
      }, 'LevelId'));
      counts.levels++;
    }
  }
  const outdoorLevelId = await insert(client, 'Level', {
    TenantId: tenantId, VenueId: venueId, BuildingId: null, Ordinal: 0, Name: 'Outdoor ground', ShortName: 'OUT', IsOutdoor: true,
    WidthM: sx2 - sx1, DepthM: sy2 - sy1, GridCellM: 1,
  }, 'LevelId');
  counts.levels++;

  /** The level a thing at point p on demo level lv belongs to: its building's, else the outdoor ground. */
  const levelAt = (lv, p, bldHint) => {
    if (bldHint && levelOf.has(`${bldHint}|${lv}`)) return levelOf.get(`${bldHint}|${lv}`);
    const inside = buildings.filter((b) => b.lvs.includes(lv) && geo.contains(b.rect, p)).sort((a, b) => geo.area(a.rect) - geo.area(b.rect));
    if (inside.length) return levelOf.get(`${inside[0].id}|${lv}`);
    if (lv === v.ground) return outdoorLevelId;
    const any = buildings.find((b) => b.lvs.includes(lv));
    return levelOf.get(`${any.id}|${lv}`);
  };

  const unit = async (levelId, imdf, name, rect, walkable, passThrough = false) => {
    const box = geo.rectBox(rect);
    if (box.w <= 0 || box.d <= 0) return null;
    counts.units++;
    return insert(client, 'Unit', {
      TenantId: tenantId, VenueId: venueId, LevelId: levelId, ImdfCategory: imdf, Name: name, ShapeKind: 'BOX',
      CenterX: box.cx, CenterY: box.cy, WidthM: box.w, DepthM: box.d, RotationDeg: 0, GeometryGeoJson: geo.rectPolygon(rect),
      IsWalkable: walkable, PassThrough: passThrough,
    }, 'UnitId');
  };
  const opening = async (levelId, unitId, imdf, name, geometry, width, entrance = false) => {
    counts.openings++;
    return insert(client, 'Opening', {
      TenantId: tenantId, VenueId: venueId, LevelId: levelId, UnitId: unitId, ImdfCategory: imdf, Name: name,
      GeometryGeoJson: geometry, IsVenueEntrance: entrance, ClearWidthM: width,
    }, 'OpeningId');
  };

  // Walkways: the demo's corridor centre-lines with their widths become walkable units;
  // our publish generates the graph from them (L32, L119).
  const nodes = new Map(v.graph.nodes.map((n) => [n.k, n]));
  for (const l of v.graph.lines) {
    const mid = [(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2];
    const box = geo.segmentBox(l.a, l.b, l.w);
    if (box.w <= 0) continue;
    const levelId = l.out && l.lv === v.ground && !l.bld ? outdoorLevelId : levelAt(l.lv, mid, l.bld);
    counts.units++;
    await insert(client, 'Unit', {
      TenantId: tenantId, VenueId: venueId, LevelId: levelId, ImdfCategory: l.zone ? 'parking' : 'walkway',
      Name: l.covered ? 'Covered walkway' : null, ShapeKind: 'BOX', CenterX: box.cx, CenterY: box.cy, WidthM: box.w, DepthM: box.d,
      RotationDeg: box.rot, GeometryGeoJson: box.geo, IsWalkable: true,
    }, 'UnitId');
  }
  // Bridges and links: explicit walkways between buildings on one level.
  for (const e of v.graph.edges.filter((x) => x.kind === 'bridge')) {
    const a = nodes.get(e.a);
    const b = nodes.get(e.b);
    const box = geo.segmentBox([a.x, a.y], [b.x, b.y], e.w);
    counts.units++;
    await insert(client, 'Unit', {
      TenantId: tenantId, VenueId: venueId, LevelId: levelAt(a.lv, [a.x, a.y]), ImdfCategory: 'footbridge', Name: e.label,
      ShapeKind: 'BOX', CenterX: box.cx, CenterY: box.cy, WidthM: box.w, DepthM: box.d, RotationDeg: box.rot, GeometryGeoJson: box.geo, IsWalkable: true,
    }, 'UnitId');
  }

  for (const a of v.areas) {
    const [imdf, walkable] = AREA_UNIT[a.kind] || ['unspecified', false];
    for (const lv of a.lvs) await unit(levelAt(lv, [(a.rect[0] + a.rect[2]) / 2, (a.rect[1] + a.rect[3]) / 2], a.bld), imdf, null, a.rect, walkable);
  }
  for (const s of v.slots.filter((x) => SLOT_UNIT[x.kind])) {
    await unit(levelAt(s.lv, [(s.rect[0] + s.rect[2]) / 2, (s.rect[1] + s.rect[3]) / 2]), SLOT_UNIT[s.kind], null, s.rect, false);
  }

  for (const p of v.places) {
    const levelId = levelAt(p.lv, p.at, p.wing);
    const name = rename(p.name);
    if (p.kind === 'store' || p.kind === 'box') {
      const doors = p.doors.length ? p.doors : [p.door];
      const unitId = await unit(levelId, p.cat === 'cinema' ? 'movietheater' : 'room', name, p.rect, false, p.kind === 'box' && doors.length > 1);
      if (!unitId) continue;
      for (const d of doors) await opening(levelId, unitId, 'pedestrian', null, geo.doorOnRect(p.rect, d, p.doorW), p.doorW);
      await insert(client, 'Occupant', {
        TenantId: tenantId, VenueId: venueId, UnitId: unitId, OccupantCategoryId: ids.OccupantCategory[CATEGORY[p.cat] || 'OTHER'],
        StoreStatusId: ids.StoreStatus[STATUS[p.status] || 'OPEN'], Name: name, SearchKeywords: null,
      }, 'OccupantId');
      counts.occupants++;
    } else if (p.kind === 'zone') {
      await unit(levelId, 'parking', name, p.rect, true);
    } else if (p.kind === 'svc' && p.cat === 'exit') {
      await opening(levelId, null, 'pedestrian.principal', name, geo.doorOnRect(p.rect, p.door, p.doorW), p.doorW, true);
    } else if (p.kind === 'svc' && AMENITY[p.cat]) {
      const unitId = p.cat === 'restroom' ? await unit(levelId, 'restroom', name, p.rect, false) : null;
      if (unitId) await opening(levelId, unitId, 'pedestrian', null, geo.doorOnRect(p.rect, p.door, p.doorW), p.doorW);
      await insert(client, 'Amenity', {
        TenantId: tenantId, VenueId: venueId, LevelId: levelId, UnitId: unitId, AmenityTypeId: ids.AmenityType[AMENITY[p.cat]], Name: name, X: geo.round(p.at[0]), Y: geo.round(p.at[1]),
      }, 'AmenityId');
      counts.amenities++;
    } // lift places are the connectors' own pins; the connectors carry them
  }

  // Connectors: a lift is one row with a stop per floor; stairs, escalators and ramps are
  // one row per hop between the floors they join, two-way as in the demo.
  const hop = async (typeCode, name, from, to, evacOnly) => {
    const a = nodes.get(from.node);
    const b = nodes.get(to.node);
    counts.connectors++;
    return insert(client, 'NavConnector', {
      TenantId: tenantId, VenueId: venueId, ConnectorTypeId: ids.ConnectorType[typeCode], Name: name,
      FromLevelId: levelAt(from.lv, [a.x, a.y], from.bld), FromX: geo.round(a.x), FromY: geo.round(a.y),
      ToLevelId: levelAt(to.lv, [b.x, b.y], to.bld), ToX: geo.round(b.x), ToY: geo.round(b.y),
      IsBidirectional: true, IsEvacuationOnly: evacOnly, RiseM: geo.round(Math.abs(v.levels[to.lv].elev - v.levels[from.lv].elev)),
    }, 'NavConnectorId');
  };
  for (const c of v.connectors) {
    const stops = c.lvs.filter((lv) => c.at[lv]).map((lv) => ({ lv, node: c.at[lv], bld: c.bld }));
    if (stops.length < 2) continue;
    if (c.type === 'lift') {
      const first = nodes.get(stops[0].node);
      counts.connectors++;
      const connId = await insert(client, 'NavConnector', {
        TenantId: tenantId, VenueId: venueId, ConnectorTypeId: ids.ConnectorType.ELEVATOR, Name: c.name,
        FromLevelId: levelAt(stops[0].lv, [first.x, first.y], c.bld), FromX: geo.round(first.x), FromY: geo.round(first.y),
        ToLevelId: null, ToX: null, ToY: null, IsBidirectional: true, IsEvacuationOnly: false, RiseM: null,
      }, 'NavConnectorId');
      for (const s of stops) {
        const n = nodes.get(s.node);
        counts.stops++;
        await insert(client, 'NavConnectorStop', { TenantId: tenantId, NavConnectorId: connId, LevelId: levelAt(s.lv, [n.x, n.y], c.bld), X: geo.round(n.x), Y: geo.round(n.y) }, 'NavConnectorStopId');
      }
    } else {
      for (let i = 0; i + 1 < stops.length; i++) await hop(CONNECTOR[c.type], c.name, stops[i], stops[i + 1], false);
    }
  }
  for (const [id, byLevel] of Object.entries(v.graph.emergencyStairs || {})) {
    const stops = Object.entries(byLevel).map(([lv, node]) => ({ lv: Number(lv), node })).sort((a, b) => a.lv - b.lv);
    for (let i = 0; i + 1 < stops.length; i++) await hop('STAIRS', `${id} (evacuation only)`, stops[i], stops[i + 1], true);
  }
  return { venueId, counts };
}

module.exports = { seedDemoVenue };
