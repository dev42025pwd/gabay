// Runtime settings from gabay.GlobalSetting (standard §3.16): frozen DEFAULTS, a 30 s cache,
// invalidate-on-write, resolvers that NEVER throw (any database error returns the default, so
// sign-in and the shopper app keep working), a PUBLIC_FLAGS allow-list and a pre-auth
// getPublicConfig() that returns {} on error.
//
// Table (db/schema.sql): GlobalSetting(TenantId NULL = platform default, non-NULL = tenant
// override; SettingKey; SettingValue VARCHAR(400)). Unique on (TenantId, SettingKey).
// This file seeds no rows: a key with no row simply uses its default below.
'use strict';

const { createLogger } = require('../utils/logger');

/**
 * Every key the API reads, with its safe default and why. A key must be listed here before it is
 * used (Blueprint invariant 16). Module gates fail CLOSED (default off); the numbers are the
 * Blueprint's stated defaults. Values in the database are text and are parsed to the default's type.
 */
const DEFAULTS = Object.freeze({
  // Module gate, fail closed. OFF until the L42 legal gate clears (Blueprint invariant 16).
  'analytics.routeTraces': false,
  // Module gate, fail closed (L28, P1): the live-status overlay stays dark until it is built.
  'liveStatus.overlay': false,
  // Metres a no-stairs route may cost over the stairs route before stairs stop leading (L99).
  'routing.stairsSaveM': 144,
  // Smallest group shown in analytics; the PDPC guide's "5 or more" (L116, OQ16).
  'analytics.minGroupN': 5,
  // Idle seconds that end a visit session (Blueprint 4.8).
  'analytics.sessionIdleS': 300,
  // Widest place, in metres, that counts for calibration (Blueprint 4.3, DC18).
  'calibration.maxPlaceM': 6,
});

/**
 * What a non-admin client, and the pre-auth config call, may read. DESIGN CHOICE: only the two
 * module gates, because a client must know whether a module is on and needs nothing else before
 * sign-in.
 */
const PUBLIC_FLAGS = Object.freeze(['analytics.routeTraces', 'liveStatus.overlay']);

const CACHE_TTL_MS = 30_000;

/** Text from the database -> the default's type, or the default when it does not parse. */
function parseValue(text, fallback) {
  if (typeof fallback === 'boolean') {
    const v = String(text).trim().toLowerCase();
    if (['true', '1', 'on', 'yes'].includes(v)) return true;
    if (['false', '0', 'off', 'no'].includes(v)) return false;
    return fallback;
  }
  if (typeof fallback === 'number') {
    const n = Number(text);
    return Number.isFinite(n) && String(text).trim() !== '' ? n : fallback;
  }
  return String(text);
}

/**
 * @param {(text:string, params:any[]) => Promise<{rows:any[]}>} query  db.query (injected so a test can break it)
 * @param {{warn:Function}} logger
 * @param {() => number} now  clock, injected for the cache test
 */
function createSettings(query, logger = createLogger(), now = Date.now) {
  /** cache key (tenant id or 'platform') -> { at, values: Map(key -> parsed) } */
  const cache = new Map();

  async function load(tenantId) {
    // tenantId comes from the request context (rule 2). A NULL id matches no tenant row.
    const result = await query(
      `SELECT TenantId, SettingKey, SettingValue
         FROM gabay.GlobalSetting
        WHERE TenantId = $1 OR TenantId IS NULL
        ORDER BY TenantId NULLS FIRST`, // tidy output only: the precedence is applied in JS below
      [tenantId],
    );
    // Precedence is applied here, not trusted to the SQL's ORDER BY: platform rows first, then this
    // tenant's own rows replace them. A row for any other tenant is ignored (rule 2, defence in depth).
    const known = result.rows.filter((row) => Object.hasOwn(DEFAULTS, row.settingkey));
    const platform = known.filter((row) => row.tenantid === null);
    const own = tenantId === null ? [] : known.filter((row) => Number(row.tenantid) === tenantId);
    const values = new Map();
    for (const row of [...platform, ...own]) {
      values.set(row.settingkey, parseValue(row.settingvalue, DEFAULTS[row.settingkey]));
    }
    return values;
  }

  async function valuesFor(tenantId) {
    const id = tenantId ?? 'platform';
    const hit = cache.get(id);
    if (hit && now() - hit.at < CACHE_TTL_MS) return hit.values;
    const values = await load(tenantId ?? null);
    cache.set(id, { at: now(), values });
    return values;
  }

  /**
   * One setting for a tenant (or the platform when tenantId is null). Never throws:
   * a database error, or an unknown key, returns the default (undefined for an unknown key).
   */
  async function getSetting(key, tenantId = null) {
    const fallback = DEFAULTS[key];
    try {
      const values = await valuesFor(tenantId);
      return values.has(key) ? values.get(key) : fallback;
    } catch (err) {
      logger.warn({ err, key }, 'setting lookup failed, using the default');
      return fallback;
    }
  }

  /** The PUBLIC_FLAGS for a tenant (or the platform), for non-admin clients. Never throws. */
  async function getPublicFlags(tenantId = null) {
    const out = {};
    for (const key of PUBLIC_FLAGS) out[key] = await getSetting(key, tenantId);
    return out;
  }

  /** Pre-auth config: the platform's public flags, or {} on any error. Never throws. */
  async function getPublicConfig() {
    try {
      const values = await valuesFor(null);
      const out = {};
      for (const key of PUBLIC_FLAGS) out[key] = values.has(key) ? values.get(key) : DEFAULTS[key];
      return out;
    } catch (err) {
      logger.warn({ err }, 'public config lookup failed, returning {}');
      return {};
    }
  }

  /** Call after any write to GlobalSetting so the next read sees it (a tenant id, or none for all). */
  function invalidate(tenantId) {
    if (tenantId === undefined) cache.clear();
    else cache.delete(tenantId ?? 'platform');
  }

  return { getSetting, getPublicFlags, getPublicConfig, invalidate };
}

let shared = null;

/** The process-wide resolver over the shared pool, created on first use. */
function getSettings() {
  if (!shared) {
    const { getDb } = require('../db');
    shared = createSettings((text, params) => getDb().query(text, params));
  }
  return shared;
}

module.exports = { DEFAULTS, PUBLIC_FLAGS, CACHE_TTL_MS, createSettings, getSettings };
