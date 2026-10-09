// Lookups, read-only (Blueprint 4.15; plan/FF0-dev-stub-lookups.md section 3): the option lists behind the admin's dropdowns, read from
// the seeded tables (rule 5: no hardcoded option list). Phase 3 (R11) adds tenant values on a screen, the maintenance
// screen and cascading lookups; none of that is here.
//
// The allow-list (rule 3) is this frozen map: a name in the URL selects an entry, and nothing the client sends reaches
// SQL as anything but a bound parameter. Each entry carries its own literal SQL, so the table and its id column are
// never built from text and the tenant-predicate lint can read every query. A later slice adds its name as one more entry
// (for example 'connector-types' in FF-10).
//
// The global-lookup trap (Blueprint Part 1): rows with TenantId NULL are platform defaults, so a tenant reads
// (TenantId = $1 OR TenantId IS NULL) and this file never writes a row, NULL-tenant or otherwise. The tenant is the
// request's (req.tenantCompanyID, rule 2), passed in by the route, never read from anything the client sent.
'use strict';

const { httpError } = require('../utils/errors');
const { parsePaging, likePattern, runPaged } = require('../utils/pagination');

const NOT_FOUND = 'Not found';
/** A lookup id as it appears in the URL: digits only, short enough for a 32-bit integer column. */
const ID_PATTERN = /^\d{1,9}$/;

/**
 * Both orders at once: SortOrder, then Label, then the id so pages never overlap. The client has no say in it, so
 * the one key is the allow-list and `id` is the output column every entry below names.
 */
const PAGING = Object.freeze({
  sortMap: Object.freeze({ order: 'SortOrder ASC, Label' }),
  defaultSort: 'order',
  tieBreaker: 'id',
});

/**
 * @typedef {{ id: number, code: string, label: string, isActive: boolean }} LookupRow
 * @typedef {object} LookupEntry
 * @property {(query: Function, tenantId: number, search: string|null, paging: object) => Promise<object>} page
 *   the list: active rows of the tenant and the platform, filtered by a label search, paged
 * @property {(query: Function, tenantId: number, id: number) => Promise<{rows: LookupRow[]}>} one
 *   one row, active or not, of the tenant or the platform; never another tenant's
 */

/** @type {Readonly<Record<string, LookupEntry>>} */
const LOOKUPS = Object.freeze({
  'building-types': Object.freeze({
    page: (query, tenantId, search, paging) =>
      runPaged({
        query,
        select: 'BuildingTypeId AS id, Code AS code, Label AS label, IsActive AS "isActive"',
        from: 'gabay.BuildingType',
        where:
          '(TenantId = $1 OR TenantId IS NULL) AND IsActive AND ($2::text IS NULL OR Label ILIKE $2)',
        params: [tenantId, search],
        paging,
      }),
    one: (query, tenantId, id) =>
      query(
        `SELECT BuildingTypeId AS id, Code AS code, Label AS label, IsActive AS "isActive"
           FROM gabay.BuildingType
          WHERE BuildingTypeId = $1 AND (TenantId = $2 OR TenantId IS NULL)`,
        [id, tenantId],
      ),
  }),
  'amenity-types': Object.freeze({
    page: (query, tenantId, search, paging) =>
      runPaged({
        query,
        select: 'AmenityTypeId AS id, Code AS code, Label AS label, IsActive AS "isActive"',
        from: 'gabay.AmenityType',
        where:
          '(TenantId = $1 OR TenantId IS NULL) AND IsActive AND ($2::text IS NULL OR Label ILIKE $2)',
        params: [tenantId, search],
        paging,
      }),
    one: (query, tenantId, id) =>
      query(
        `SELECT AmenityTypeId AS id, Code AS code, Label AS label, IsActive AS "isActive"
           FROM gabay.AmenityType
          WHERE AmenityTypeId = $1 AND (TenantId = $2 OR TenantId IS NULL)`,
        [id, tenantId],
      ),
  }),
  'transit-types': Object.freeze({
    page: (query, tenantId, search, paging) =>
      runPaged({
        query,
        select: 'TransitTypeId AS id, Code AS code, Label AS label, IsActive AS "isActive"',
        from: 'gabay.TransitType',
        where:
          '(TenantId = $1 OR TenantId IS NULL) AND IsActive AND ($2::text IS NULL OR Label ILIKE $2)',
        params: [tenantId, search],
        paging,
      }),
    one: (query, tenantId, id) =>
      query(
        `SELECT TransitTypeId AS id, Code AS code, Label AS label, IsActive AS "isActive"
           FROM gabay.TransitType
          WHERE TransitTypeId = $1 AND (TenantId = $2 OR TenantId IS NULL)`,
        [id, tenantId],
      ),
  }),
});

/** The entry for a URL name, or a 404. Own keys only: 'constructor' and '__proto__' are not lookups. */
function entryFor(name) {
  if (typeof name !== 'string' || !Object.hasOwn(LOOKUPS, name)) throw httpError(404, NOT_FOUND);
  return LOOKUPS[name];
}

/** The tenant must be the request context's: a missing one is a bug in the route chain, never a request for "everything". */
function assertTenant(tenantId) {
  if (!Number.isInteger(tenantId)) throw new Error('lookup: no tenant in the request context');
}

/** @param {{query: (text: string, params: any[]) => Promise<{rows: any[]}>}} db */
function createLookupService(db) {
  const query = (text, params) => db.query(text, params);
  return {
    /**
     * @param {string} name  the lookup's name in the URL
     * @param {number} tenantId  req.tenantCompanyID
     * @param {object} params  req.query: only page, pageSize and search are read
     * @returns {Promise<{items: LookupRow[], totalCount: number, page: number, pageSize: number}>}
     * @throws {Error} 404 for a name that is not on the allow-list
     */
    async list(name, tenantId, params) {
      const entry = entryFor(name);
      assertTenant(tenantId);
      // sortBy and sortOrder are deliberately not passed on: the order is fixed.
      const paging = parsePaging(
        { page: params.page, pageSize: params.pageSize, search: params.search },
        PAGING,
      );
      const search = paging.search === null ? null : likePattern(paging.search);
      return entry.page(query, tenantId, search, paging);
    },

    /**
     * One row, even an inactive one (the picker keeps showing a value that has since been switched off, section 4.10).
     * @param {string} id  the id as it appears in the URL
     * @returns {Promise<LookupRow>}
     * @throws {Error} 404 for an unknown name, a malformed id, no such row, or a row that belongs to another tenant
     */
    async get(name, tenantId, id) {
      const entry = entryFor(name);
      assertTenant(tenantId);
      if (typeof id !== 'string' || !ID_PATTERN.test(id)) throw httpError(404, NOT_FOUND);
      const { rows } = await entry.one(query, tenantId, Number(id));
      if (rows.length === 0) throw httpError(404, NOT_FOUND);
      return rows[0];
    },
  };
}

module.exports = { createLookupService, LOOKUPS };
