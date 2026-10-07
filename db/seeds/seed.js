// Gabay's local test seed (plan.html L119, FEATURE_PIPELINE P0-02). Local database and
// Auth emulator only. Re-runnable: it removes its own two tenants and accounts first.
//   npm run seed            the venues and the six accounts (starts the Auth emulator)
//   npm run seed:db-only    the venues only
'use strict';

const fs = require('fs');
const path = require('path');
const { connect, insert } = require('./lib/db');
const { seedPlatform } = require('./lib/lookups');
const { seedDemoVenue } = require('./lib/demo');
const { seedSpikeVenue } = require('./lib/spike');
const { seedAccounts, SEED_EMAILS } = require('./lib/accounts');

const SOURCES = path.join(__dirname, 'sources');
const SPIKE_UUID = '87872435-5008-4e48-bd54-a7c561c885c3'; // what the penthouse's real H2s broadcast
const TENANTS = {
  DEMO_MALLS: { Name: 'Demo Malls', BeaconProximityUuid: null },
  SPIKE_VENUES: { Name: 'Spike Venues', BeaconProximityUuid: SPIKE_UUID },
};
const DEMO_VENUES = ['aurora', 'bayview', 'meridian', 'spire'];
// L119: the penthouse keeps Major 1 (its real H2s); MEZZ office gets Major 2. Exports take the next free Major.
const SPIKE_VENUES = [
  // internal: kept out of git (L48, L123); a clean clone has no copy, so it is skipped with a note.
  { file: 'internal/penthouse.json', code: 'PENTHOUSE', major: 1, internal: true },
  { file: 'spike/mezz.json', code: 'MEZZ_OFFICE', major: 2 },
];

// Children before parents. Table names are this file's constants, never input.
const TENANT_TABLES = ['UserVenueGrant', 'UserRole', 'Beacon', 'NavConnectorStop', 'NavConnector', 'Amenity', 'Occupant', 'Opening', 'FloorObject', 'Anchor', 'TransitPoint', 'Unit', 'Level', 'Building', 'Venue', 'BuildingType'];

async function removeTenant(client, code) {
  const t = await client.query('SELECT TenantId AS id FROM gabay.Tenant WHERE Code = $1', [code]);
  if (!t.rows.length) return;
  const id = t.rows[0].id;
  for (const table of TENANT_TABLES) await client.query(`DELETE FROM gabay.${table} WHERE TenantId = $1`, [id]);
  await client.query('DELETE FROM gabay.Tenant WHERE TenantId = $1', [id]);
}

async function removeAccounts(client) {
  await client.query('DELETE FROM gabay.UserRole WHERE UserId IN (SELECT UserId FROM gabay.AppUser WHERE Email = ANY($1))', [SEED_EMAILS]);
  await client.query('DELETE FROM gabay.UserVenueGrant WHERE UserId IN (SELECT UserId FROM gabay.AppUser WHERE Email = ANY($1))', [SEED_EMAILS]);
  await client.query('DELETE FROM gabay.AppUser WHERE Email = ANY($1)', [SEED_EMAILS]);
  await client.query('DELETE FROM gabay.ShopperAccount WHERE Email = ANY($1)', [SEED_EMAILS]);
}

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(SOURCES, rel), 'utf8'));

/** The product owner's own spike exports (sources/spike-exports/*.json), each on the next free Major. */
function exportedVenues(firstMajor) {
  const dir = path.join(SOURCES, 'spike-exports');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f, i) => ({
    file: `spike-exports/${f}`, code: `SPIKE_${path.basename(f, '.json').toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`.slice(0, 40), major: firstMajor + i,
  }));
}

async function main() {
  const withAccounts = !process.argv.includes('--no-accounts');
  const client = await connect();
  try {
    await client.query('BEGIN');
    await removeAccounts(client);
    for (const code of Object.keys(TENANTS)) await removeTenant(client, code);
    const ids = await seedPlatform(client);

    const tenants = {};
    for (const [code, t] of Object.entries(TENANTS)) tenants[code] = await insert(client, 'Tenant', { Code: code, ...t }, 'TenantId');
    const venuesByTenant = { DEMO_MALLS: [], SPIKE_VENUES: [] };

    for (const id of DEMO_VENUES) {
      const v = readJson(`demo/${id}.json`);
      const { venueId, counts } = await seedDemoVenue(client, tenants.DEMO_MALLS, ids, v);
      venuesByTenant.DEMO_MALLS.push(venueId);
      console.log(`Demo Malls  · ${v.name}: ${JSON.stringify(counts)}`);
    }
    for (const s of [...SPIKE_VENUES, ...exportedVenues(3)]) {
      if (s.internal && !fs.existsSync(path.join(SOURCES, s.file))) {
        console.log(`Spike Venues · skipped ${s.code}: sources/${s.file} is internal and not in git (L123); copy it in from an internal source to seed it.`);
        continue;
      }
      const v = readJson(s.file);
      const { venueId, counts } = await seedSpikeVenue(client, tenants.SPIKE_VENUES, ids, v, s);
      venuesByTenant.SPIKE_VENUES.push(venueId);
      console.log(`Spike Venues · ${v.name} (Major ${s.major}): ${JSON.stringify(counts)}`);
    }

    if (withAccounts) for (const line of await seedAccounts(client, ids, tenants, venuesByTenant)) console.log(`Account · ${line}`);
    await client.query('COMMIT');
    console.log('Seed committed.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`Seed rolled back: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
