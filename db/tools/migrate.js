// npm run migrate: applies db/migrations/NNNN_name.sql in order and prints each verification query.
// Safe to run any number of times (migrations are idempotent, plan DC-4). Exit 0 on success.
'use strict';

const { connect } = require('./lib/connect');
const { runMigrations } = require('./lib/migrations');

async function main() {
  const client = await connect();
  try {
    await runMigrations(client);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
