// Platform lookup rows (TenantId NULL, DC1) and roles. Inserted once; re-runs reuse them.
// Codes follow the schema's comments; costs are the demo's height-based defaults (L91).
'use strict';

const { insert } = require('./db');

const PLATFORM = {
  BuildingType: [
    { Code: 'MAIN', Label: 'Main building' },
    { Code: 'WING', Label: 'Wing' },
    { Code: 'ANNEX', Label: 'Annex' },
    { Code: 'PARKING', Label: 'Parking' },
  ],
  OccupantCategory: [
    { Code: 'FASHION', Label: 'Fashion' },
    { Code: 'DINING', Label: 'Food and drink' },
    { Code: 'ELECTRONICS', Label: 'Electronics' },
    { Code: 'BOOKS', Label: 'Books and hobbies' },
    { Code: 'SERVICES', Label: 'Services' },
    { Code: 'CINEMA', Label: 'Cinema' },
    { Code: 'ENTERTAINMENT', Label: 'Entertainment' },
    { Code: 'LEISURE', Label: 'Leisure' },
    { Code: 'OTHER', Label: 'Other shops' },
  ],
  AmenityType: [
    { Code: 'CR', Label: 'Restroom', SearchSynonyms: 'comfort room, cr, restroom, toilet, banyo, washroom', IsAccessible: false },
    { Code: 'CR_PWD', Label: 'Accessible restroom', SearchSynonyms: 'pwd cr, accessible toilet', IsAccessible: true },
    { Code: 'NURSING', Label: 'Nursing room', SearchSynonyms: 'breastfeeding, lactation' },
    { Code: 'PRAYER', Label: 'Prayer room', SearchSynonyms: 'chapel, prayer' },
    { Code: 'FIRST_AID', Label: 'First aid', SearchSynonyms: 'clinic, medic' },
    { Code: 'SECURITY', Label: 'Security', SearchSynonyms: 'guard, guwardiya' },
    { Code: 'INFO', Label: 'Information desk', SearchSynonyms: 'concierge, help, info' },
    { Code: 'ATM', Label: 'ATM', SearchSynonyms: 'bank, cash, atm' },
    { Code: 'EV_CHARGING', Label: 'EV charging', SearchSynonyms: 'electric car, charger' },
    { Code: 'REFUGE_AREA', Label: 'Refuge area' },
    { Code: 'ASSEMBLY_AREA', Label: 'Assembly area' },
  ],
  TransitType: [
    { Code: 'TRAIN_BRIDGE', Label: 'Train bridge' },
    { Code: 'TERMINAL', Label: 'Terminal' },
    { Code: 'JEEPNEY_BAY', Label: 'Jeepney bay' },
    { Code: 'TAXI_BAY', Label: 'Taxi bay' },
    { Code: 'PARKING_ENTRY', Label: 'Parking entry' },
    { Code: 'DROP_OFF', Label: 'Drop-off' },
  ],
  ConnectorType: [
    { Code: 'ELEVATOR', Label: 'Lift', CostModel: 'ELEVATOR', IsStepFree: true, CostBaseM: 30, CostPerRiseM: 1.5 },
    { Code: 'STAIRS', Label: 'Stairs', CostModel: 'STAIRS', IsStepFree: false, CostBaseM: 34, CostPerRiseM: 3 },
    { Code: 'ESCALATOR', Label: 'Escalator', CostModel: 'ESCALATOR', IsStepFree: false, CostBaseM: 14, CostPerRiseM: 1 },
    { Code: 'RAMP', Label: 'Ramp', CostModel: 'RAMP', IsStepFree: true, CostBaseM: 20, CostPerRiseM: 2 },
  ],
  // The spike's RF model gives the signal penalties (assets/venue/*.json, model.obstacleLossDbByKind).
  ObjectType: [
    { Code: 'PILLAR', Label: 'Pillar', BlocksWalk: true, SignalPenaltyDb: 20 },
    { Code: 'SHAFT', Label: 'Shaft', BlocksWalk: true, SignalPenaltyDb: 20 },
    { Code: 'FURNITURE', Label: 'Furniture', BlocksWalk: true, SignalPenaltyDb: 1 },
  ],
  // L117: the H2's conservative spec until a unit label is read.
  BeaconModel: [{ Code: 'MOKO_H2', Label: 'MOKOSmart H2', IpRating: 'IP65', BatteryLifeMonths: 50 }],
  StoreStatus: [
    { Code: 'OPEN', Label: 'Open', IsRoutable: true },
    { Code: 'CLOSED', Label: 'Closed', IsRoutable: false },
    { Code: 'BEING_REPAIRED', Label: 'Being repaired', IsRoutable: false },
    { Code: 'OPENING_SOON', Label: 'Opening soon', IsRoutable: false },
  ],
};

const ROLES = [
  { Code: 'SUPERADMIN', Label: 'Super admin', IsPlatformRole: true },
  { Code: 'MALL_ADMIN', Label: 'Mall admin', IsPlatformRole: false },
  { Code: 'VENUE_EDITOR', Label: 'Venue editor', IsPlatformRole: false },
  { Code: 'VIEWER', Label: 'Viewer', IsPlatformRole: false },
];

const ID_COLUMN = (table) => `${table}Id`;

/** Find a lookup row by (TenantId, Code), inserting it when absent. Returns its id. */
async function ensureLookup(client, table, tenantId, row) {
  const id = ID_COLUMN(table);
  const found = await client.query(
    `SELECT ${id} AS id FROM gabay.${table} WHERE Code = $1 AND TenantId IS NOT DISTINCT FROM $2`,
    [row.Code, tenantId],
  );
  if (found.rows.length) return found.rows[0].id;
  return insert(client, table, { TenantId: tenantId, ...row }, id);
}

/** Every platform lookup and role; returns { table: { CODE: id } }. */
async function seedPlatform(client) {
  const ids = {};
  for (const [table, rows] of Object.entries(PLATFORM)) {
    ids[table] = {};
    for (const row of rows) ids[table][row.Code] = await ensureLookup(client, table, null, row);
  }
  ids.Role = {};
  for (const role of ROLES) {
    const found = await client.query('SELECT RoleId AS id FROM gabay.Role WHERE Code = $1', [role.Code]);
    ids.Role[role.Code] = found.rows.length ? found.rows[0].id : await insert(client, 'Role', role, 'RoleId');
  }
  return ids;
}

module.exports = { seedPlatform, ensureLookup };
