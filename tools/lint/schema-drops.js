// schema-drops (standard §8.2): every CREATE TABLE in db/schema.sql has a matching
// DROP TABLE IF EXISTS, so the file stays re-runnable. The drop ORDER (children before parents) is
// a review item: this linter cannot check it.
'use strict';

const { violation } = require('./lib/context');
const { parseSchema } = require('./lib/schema');

const NAME = 'schema-drops';
const SCHEMA = 'db/schema.sql';

function run(ctx) {
  if (!ctx.exists(SCHEMA) || !ctx.touches(SCHEMA)) return [];
  const { tables, drops } = parseSchema(ctx.read(SCHEMA));
  const found = [];
  for (const [key, table] of tables) {
    if (!drops.has(key)) {
      found.push(
        violation(
          SCHEMA,
          table.line,
          NAME,
          `CREATE TABLE gabay.${table.name} has no matching DROP TABLE IF EXISTS gabay.${table.name} (standard §8.2)`,
        ),
      );
    }
  }
  return found;
}

module.exports = { name: NAME, run };
