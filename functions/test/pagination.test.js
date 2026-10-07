'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parsePaging,
  likePattern,
  runPaged,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} = require('../src/utils/pagination');
const { singleConnectionDb } = require('./helpers');

const SORT_MAP = { name: 't.Name', created: 't.Created' };
const OPTS = { sortMap: SORT_MAP, defaultSort: 'name', tieBreaker: 't.Id' };

test('pagination: defaults and clamps', () => {
  const p = parsePaging({}, OPTS);
  assert.equal(p.page, 1);
  assert.equal(p.pageSize, DEFAULT_PAGE_SIZE);
  assert.equal(p.offset, 0);
  assert.equal(p.search, null);
  assert.equal(p.orderBy, 't.Name ASC, t.Id ASC');

  const big = parsePaging({ page: '3', pageSize: '100000' }, OPTS);
  assert.equal(big.pageSize, MAX_PAGE_SIZE, 'pageSize is capped');
  assert.equal(big.offset, 2 * MAX_PAGE_SIZE);

  const junk = parsePaging({ page: '-4', pageSize: 'abc', sortOrder: 'sideways' }, OPTS);
  assert.equal(junk.page, 1);
  assert.equal(junk.pageSize, DEFAULT_PAGE_SIZE);
  assert.equal(junk.sortOrder, 'ASC');
  // Repeated query keys arrive as arrays: ignored, not a crash.
  assert.equal(parsePaging({ page: ['1', '2'] }, OPTS).page, 1);
});

test('pagination: sortBy only ever selects an allow-list entry; an injected key falls to the default', () => {
  assert.equal(
    parsePaging({ sortBy: 'created', sortOrder: 'desc' }, OPTS).orderBy,
    't.Created DESC, t.Id ASC',
  );
  for (const evil of [
    'name; DROP TABLE gabay.Tenant',
    'constructor',
    '__proto__',
    'toString',
    "' OR 1=1 --",
  ]) {
    assert.equal(parsePaging({ sortBy: evil }, OPTS).orderBy, 't.Name ASC, t.Id ASC', evil);
  }
  assert.throws(
    () => parsePaging({}, { sortMap: SORT_MAP, defaultSort: 'nope' }),
    /not in sortMap/,
  );
});

test('pagination: likePattern escapes the LIKE wildcards', () => {
  assert.equal(likePattern('50%_off\\'), '%50\\%\\_off\\\\%');
});

test('pagination: count and page agree on a TEMP table, across every page, with a filter and a search', async () => {
  const db = singleConnectionDb();
  try {
    await db.query(
      'CREATE TEMP TABLE pg_rows (Id INT PRIMARY KEY, Name VARCHAR(40) NOT NULL, Kind VARCHAR(10) NOT NULL)',
      [],
    );
    // 57 rows; every third is kind B; names contain a literal % in every 10th row.
    await db.query(
      `INSERT INTO pg_rows
       SELECT g, CASE WHEN g % 10 = 0 THEN 'Sale 50% store ' || g ELSE 'Store ' || g END,
              CASE WHEN g % 3 = 0 THEN 'B' ELSE 'A' END
         FROM generate_series(1, 57) AS g`,
      [],
    );

    const run = (query) => {
      const paging = parsePaging(query, {
        sortMap: { name: 't.Name', id: 't.Id' },
        defaultSort: 'id',
        tieBreaker: 't.Id',
      });
      const params = ['B'];
      let where = 't.Kind = $1';
      if (paging.search) {
        params.push(likePattern(paging.search));
        where += ` AND t.Name ILIKE $${params.length}`;
      }
      return runPaged({
        query: db.query,
        select: 't.Id, t.Name',
        from: 'pg_rows t',
        where,
        params,
        paging,
      });
    };

    // Kind B: ids 3,6,...,57 = 19 rows. Walk every page and compare with the count.
    const seen = [];
    let total = null;
    for (let page = 1; page <= 4; page += 1) {
      const r = await run({ page: String(page), pageSize: '5' });
      assert.equal(r.page, page);
      assert.equal(r.pageSize, 5);
      total = r.totalCount;
      seen.push(...r.items.map((i) => i.id));
    }
    assert.equal(total, 19);
    assert.equal(seen.length, total, 'the pages add up to totalCount');
    assert.equal(new Set(seen).size, seen.length, 'no row appears on two pages');
    assert.deepEqual(
      seen,
      [...seen].sort((a, b) => a - b),
    );

    // Past the end: empty items, same count.
    const past = await run({ page: '9', pageSize: '5' });
    assert.deepEqual(past.items, []);
    assert.equal(past.totalCount, 19);

    // A search shares the where clause: the literal % matches only the escaped rows (30, 60 -> 30 is B).
    const searched = await run({ search: '50%', pageSize: '50' });
    assert.equal(searched.totalCount, searched.items.length);
    assert.deepEqual(
      searched.items.map((i) => i.id),
      [30],
    );

    // Descending by name uses the allow-listed column.
    const desc = await run({ sortBy: 'name', sortOrder: 'DESC', pageSize: '3' });
    assert.equal(desc.items.length, 3);
    assert.ok(desc.items[0].name >= desc.items[1].name);
  } finally {
    await db.close();
  }
});
