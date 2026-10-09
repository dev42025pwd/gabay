// Validated configuration (standard §3.16): the repo-root .env is loaded by absolute path, every
// value is checked with zod, and a missing or malformed required key stops the process with a
// readable message instead of failing later on the first query.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { z } = require('zod');

/** The repo-root .env, found from this file so the working directory never matters (§3.16). */
const ENV_FILE = path.resolve(__dirname, '..', '..', '..', '.env');

/**
 * Loads the root .env with Node's built-in loader (DESIGN CHOICE: no dotenv package).
 * Values already in process.env win, so a real environment (Cloud Functions, CI) is never
 * overridden by a developer's file. Returns true when a file was read.
 */
function loadEnvFile(file = ENV_FILE) {
  if (!fs.existsSync(file)) return false;
  process.loadEnvFile(file);
  return true;
}

class ConfigError extends Error {
  constructor(problems) {
    super(
      `Invalid configuration. Fix these keys in .env (see .env.example):\n${problems
        .map((p) => `  - ${p}`)
        .join('\n')}`,
    );
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

const positiveInt = (fallback, max) => z.coerce.number().int().min(1).max(max).default(fallback);

const DEFAULT_DEV_STUB_USER_EMAIL = 'malladmin@gabay.test';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // Database (required: the API cannot do anything without it).
  PGHOST: z.string().min(1),
  PGPORT: positiveInt(5432, 65535),
  PGDATABASE: z.string().min(1),
  PGUSER: z.string().min(1),
  PGPASSWORD: z.string().min(1),
  PG_POOL_MAX: positiveInt(10, 100),
  PG_IDLE_TIMEOUT_MS: positiveInt(30_000, 3_600_000),
  PG_CONNECT_TIMEOUT_MS: positiveInt(5_000, 120_000),
  PG_STATEMENT_TIMEOUT_MS: positiveInt(60_000, 3_600_000),

  // HTTP.
  CORS_ORIGINS: z.string().default(''),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),
  MAX_JSON_BODY: z
    .string()
    .regex(/^\d+\s?(b|kb|mb)$/i, 'must look like 5mb or 512kb')
    .default('5mb'),

  // Firebase Auth (E-08). Both optional: the health check and the Functions emulator run without them.
  // FIREBASE_PROJECT_ID empty: the Admin SDK finds the project itself (Cloud Functions), or, with an emulator
  // host, this is the emulator's demo project.
  FIREBASE_PROJECT_ID: z.string().min(1).optional(),
  // host:port of the Auth emulator, development and tests ONLY. The Admin SDK then accepts UNSIGNED tokens, so
  // production refuses to start with it set (see parseConfig).
  FIREBASE_AUTH_EMULATOR_HOST: z
    .string()
    .regex(/^[A-Za-z0-9.-]+:\d{1,5}$/, 'must look like 127.0.0.1:9099')
    .optional(),

  // The development stub's one admin (E-20, FF-0): the AppUser, by email, that admin routes run as until the retrofit's
  // R1. Read only when the stub runs (NODE_ENV=development or test). The default is the mall admin who holds both
  // seeded tenants (L154).
  DEV_STUB_USER_EMAIL: z.email().max(254).default(DEFAULT_DEV_STUB_USER_EMAIL),
});

/** The Auth emulator's project (CLAUDE.md: demo-gabay), used when an emulator host is set and no project ID is. */
const EMULATOR_PROJECT_ID = 'demo-gabay';
/**
 * The only NODE_ENV values, as written in the RAW environment, under which a dev-only feature is allowed: the Auth
 * emulator host (S1) and the development stub (E-20, FF-0). One list for both guards (C2: the second use).
 */
const DEV_ONLY_ENVS = Object.freeze(['development', 'test']);

/** Pure: validates an env-like object and returns the config, or throws ConfigError. */
function parseConfig(env) {
  // An empty value in .env means "not set": it takes the default, or fails if required.
  const present = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ''));
  const result = schema.safeParse(present);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  const e = result.data;
  // An emulator host makes the Admin SDK accept UNSIGNED tokens: one leaking into a deployed function would let anyone
  // forge a sign-in. So it is allowed only when the RAW environment says NODE_ENV=development or NODE_ENV=test
  // (owner's ruling, P2-S1 review I1). An unset NODE_ENV does not count: zod defaults it to development, and a
  // deployed function that forgot NODE_ENV must not be mistaken for a developer's machine.
  const devOnlyAllowed = DEV_ONLY_ENVS.includes(present.NODE_ENV);
  if (e.FIREBASE_AUTH_EMULATOR_HOST && !devOnlyAllowed) {
    throw new ConfigError([
      'FIREBASE_AUTH_EMULATOR_HOST: set only with NODE_ENV=development or NODE_ENV=test written explicitly in the environment (the emulator accepts unsigned tokens)',
    ]);
  }
  return Object.freeze({
    env: e.NODE_ENV,
    isProduction: e.NODE_ENV === 'production',
    // True only when the RAW environment says development or test. An unset or empty NODE_ENV is false, although `env`
    // above then reads development. Every dev-only feature asks this, never `env`.
    devOnlyAllowed,
    logLevel: e.LOG_LEVEL,
    db: Object.freeze({
      host: e.PGHOST,
      port: e.PGPORT,
      database: e.PGDATABASE,
      user: e.PGUSER,
      password: e.PGPASSWORD,
      poolMax: e.PG_POOL_MAX,
      idleTimeoutMs: e.PG_IDLE_TIMEOUT_MS,
      connectTimeoutMs: e.PG_CONNECT_TIMEOUT_MS,
      statementTimeoutMs: e.PG_STATEMENT_TIMEOUT_MS,
    }),
    corsOrigins: Object.freeze(
      e.CORS_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
    trustProxyHops: e.TRUST_PROXY_HOPS,
    maxJsonBody: e.MAX_JSON_BODY,
    firebase: Object.freeze({
      projectId:
        e.FIREBASE_PROJECT_ID ?? (e.FIREBASE_AUTH_EMULATOR_HOST ? EMULATOR_PROJECT_ID : null),
      authEmulatorHost: e.FIREBASE_AUTH_EMULATOR_HOST ?? null,
    }),
    devStub: Object.freeze({ userEmail: e.DEV_STUB_USER_EMAIL }),
  });
}

let cached = null;

/**
 * The process-wide config. Loads .env first. On a bad config it throws in tests (so a test can
 * assert it) and exits 1 everywhere else (fail fast, §3.16).
 */
function getConfig() {
  if (cached) return cached;
  loadEnvFile();
  try {
    cached = parseConfig(process.env);
  } catch (err) {
    if (!(err instanceof ConfigError) || process.env.NODE_ENV === 'test') throw err;
    console.error(err.message);
    process.exit(1);
  }
  return cached;
}

module.exports = { getConfig, parseConfig, loadEnvFile, ConfigError, ENV_FILE, DEV_ONLY_ENVS };
