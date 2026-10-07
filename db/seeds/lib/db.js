// Thin helpers over pg: every value is a bound parameter (rule 3). Table and column
// names come only from this seed's own code, never from input data.
'use strict';

const { Client } = require('pg');

async function connect() {
  const client = new Client(); // PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD from .env
  await client.connect();
  return client;
}

/** INSERT one row and return its generated key. */
async function insert(client, table, row, idColumn) {
  const cols = Object.keys(row);
  const params = cols.map((_, i) => `$${i + 1}`);
  const values = cols.map((c) => toDb(row[c]));
  const sql = `INSERT INTO gabay.${table} (${cols.join(', ')}) VALUES (${params.join(', ')}) RETURNING ${idColumn}`;
  const res = await client.query(sql, values);
  return res.rows[0][idColumn.toLowerCase()];
}

/** Objects and arrays are sent as JSON text for JSONB columns. */
function toDb(v) {
  if (v !== null && typeof v === 'object' && !(v instanceof Date)) return JSON.stringify(v);
  return v;
}

module.exports = { connect, insert };
