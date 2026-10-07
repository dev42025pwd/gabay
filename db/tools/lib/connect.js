// Shared by migrate.js and setup-db.js: the repo-root .env (by absolute path, so the working
// directory never matters, standard §3.16) and one pg client.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const ENV_FILE = path.join(REPO_ROOT, '.env');
const DB_DIR = path.join(REPO_ROOT, 'db');

/** Loads the root .env with Node's built-in loader (no dotenv package). Real env vars win. */
function loadEnv() {
  if (fs.existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
}

/** A connected client from PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD. Never prints the password. */
async function connect() {
  loadEnv();
  const missing = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'].filter(
    (k) => !process.env[k],
  );
  if (missing.length) {
    throw new Error(`Missing ${missing.join(', ')}: set them in .env (see .env.example).`);
  }
  const client = new Client();
  await client.connect();
  console.log(
    `Connected to ${process.env.PGDATABASE} on ${process.env.PGHOST}:${process.env.PGPORT} as ${process.env.PGUSER}.`,
  );
  return client;
}

module.exports = { connect, loadEnv, REPO_ROOT, DB_DIR };
