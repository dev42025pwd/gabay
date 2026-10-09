// Creating and dropping the database of a working copy (plan/PH1-worktrees.md 1.1). CREATE and DROP DATABASE take no
// parameters, so the name goes into the text; that is safe only because it must match DATABASE_NAME, which the
// names from worktree-names.js always do (gabay_wt_ and letters). Plain CommonJS; `pg` is the one db/tools pins.
'use strict';

const path = require('node:path');
const { createRequire } = require('node:module');

/** The only shape of name this code puts into SQL: gabay_wt_<letters and underscores>. */
const DATABASE_NAME = /^gabay_wt_[a-z][a-z_]*$/;

function assertDatabaseName(name) {
  if (typeof name !== 'string' || !DATABASE_NAME.test(name)) {
    throw new Error(`"${name}" is not a working-copy database name (gabay_wt_<name>).`);
  }
}

/** The pg Client from db/tools (installed there; the tools folder has no package.json of its own). */
function pgClient(mainRoot) {
  return createRequire(path.join(mainRoot, 'db', 'tools', 'package.json'))('pg').Client;
}

/**
 * `ensure(name)`: creates the database when it is missing; true when it created it. `drop(name)`: drops it, ending
 * any connection still open to it; true when it existed. Both connect to the maintenance database `postgres` with
 * `connection` ({ host, port, user, password }) and close the client again. Nothing here prints a value.
 * @param {{ host: string, port: number, user: string, password: string }} connection
 * @param {new (config: object) => { connect(): Promise<void>, query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>, end(): Promise<void> }} Client
 */
function createDatabaseTools(connection, Client) {
  async function withAdmin(fn) {
    const client = new Client({ ...connection, database: 'postgres' });
    await client.connect();
    try {
      return await fn(client);
    } finally {
      await client.end();
    }
  }
  const exists = async (client, name) =>
    (await client.query('SELECT 1 AS ok FROM pg_database WHERE datname = $1', [name])).rows.length >
    0;
  return {
    async ensure(name) {
      assertDatabaseName(name);
      return withAdmin(async (client) => {
        if (await exists(client, name)) return false;
        await client.query(`CREATE DATABASE "${name}"`);
        return true;
      });
    },
    async drop(name) {
      assertDatabaseName(name);
      return withAdmin(async (client) => {
        const was = await exists(client, name);
        await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
        return was;
      });
    },
  };
}

module.exports = { createDatabaseTools, pgClient, DATABASE_NAME };
