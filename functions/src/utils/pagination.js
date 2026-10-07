// Server-side pagination (standard §3.11, Appendix A.8): { items, totalCount, page, pageSize }.
// The count and the page are built from ONE where clause and ONE params array, so paging,
// counting and filtering can never disagree about the row set. A sort key from the client is
// never put into SQL: it only selects an entry of the caller's allow-list map (rule 3).
'use strict';

const DEFAULT_PAGE_SIZE = 25;
/** The most rows a client can ask for in one page. */
const MAX_PAGE_SIZE = 200;
const MAX_SEARCH_LENGTH = 100;

/** A positive integer from a query-string value, or the fallback (lenient: never a 500, §3.7). */
function toPositiveInt(value, fallback) {
  if (typeof value !== 'string' || !/^\d{1,9}$/.test(value)) return fallback;
  const n = Number(value);
  return n >= 1 ? n : fallback;
}

/**
 * Reads page, pageSize, search, sortBy and sortOrder from a query object.
 * @param {object} query  req.query
 * @param {object} opts
 * @param {Record<string,string>} opts.sortMap  client sort key -> SQL column expression (the allow-list)
 * @param {string} opts.defaultSort  a key of sortMap, used when the client's key is unknown or absent
 * @param {string} [opts.tieBreaker]  a unique SQL column, appended so pages never overlap
 * @returns {{page:number,pageSize:number,offset:number,search:string|null,sortBy:string,sortOrder:'ASC'|'DESC',orderBy:string}}
 */
function parsePaging(query, { sortMap, defaultSort, tieBreaker = null }) {
  if (!Object.hasOwn(sortMap, defaultSort)) {
    throw new Error(`parsePaging: defaultSort "${defaultSort}" is not in sortMap`);
  }
  const page = toPositiveInt(query.page, 1);
  const pageSize = Math.min(toPositiveInt(query.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const sortBy =
    typeof query.sortBy === 'string' && Object.hasOwn(sortMap, query.sortBy)
      ? query.sortBy
      : defaultSort;
  const sortOrder = String(query.sortOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  const search =
    typeof query.search === 'string' && query.search.trim() !== ''
      ? query.search.trim().slice(0, MAX_SEARCH_LENGTH)
      : null;
  const orderBy = `${sortMap[sortBy]} ${sortOrder}${tieBreaker ? `, ${tieBreaker} ASC` : ''}`;
  return { page, pageSize, offset: (page - 1) * pageSize, search, sortBy, sortOrder, orderBy };
}

/** A LIKE/ILIKE pattern that matches `search` anywhere, with LIKE's own wildcards escaped. */
function likePattern(search) {
  return `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Runs the count and the page from the same where clause and params.
 * `select`, `from`, `where` and `paging.orderBy` are SQL written by the caller (identifiers come
 * from allow-lists, values from `params`): never pass a client string in them.
 * @param {object} args
 * @param {(text:string, params:any[]) => Promise<{rows:any[]}>} args.query  db.query or a transaction's query
 * @param {string} args.select  column list
 * @param {string} args.from  table and joins
 * @param {string} [args.where]  condition using $1..$n for `params` (no WHERE keyword)
 * @param {any[]} [args.params]
 * @param {ReturnType<typeof parsePaging>} args.paging
 */
async function runPaged({ query, select, from, where = '', params = [], paging }) {
  // sql-identifiers: caller-written fragments (select, from, where use $n placeholders), never client text
  const whereSql = where ? `WHERE ${where}` : '';
  // sql-identifiers: caller-written fragments (select, from, where use $n placeholders), never client text
  const count = await query(`SELECT COUNT(*) AS n FROM ${from} ${whereSql}`, params);
  const limitAt = params.length + 1;
  const page = await query(
    // sql-identifiers: select, from, where as above; orderBy is built from the caller's sortMap allow-list
    `SELECT ${select} FROM ${from} ${whereSql} ORDER BY ${paging.orderBy} LIMIT $${limitAt} OFFSET $${limitAt + 1}`,
    [...params, paging.pageSize, paging.offset],
  );
  return {
    items: page.rows,
    totalCount: Number(count.rows[0].n),
    page: paging.page,
    pageSize: paging.pageSize,
  };
}

module.exports = {
  parsePaging,
  likePattern,
  runPaged,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_SEARCH_LENGTH,
};
