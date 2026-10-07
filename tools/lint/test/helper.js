// Test helpers: build a throwaway repo tree, run one linter over it, compare "file:line:rule".
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runLinters } = require('../run');

/** A small schema with the shapes the linters care about (the real one is signed and not edited). */
const SCHEMA = `-- test schema
DROP TABLE IF EXISTS gabay.Venue         CASCADE;
DROP TABLE IF EXISTS gabay.Role          CASCADE;
DROP TABLE IF EXISTS gabay.Level         CASCADE;

CREATE TABLE gabay.Level (
    LevelId              INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_Level PRIMARY KEY,
    TenantId             INT                NOT NULL
);
CREATE TABLE gabay.Role (
    RoleId               INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_Role PRIMARY KEY,
    Code                 VARCHAR(40)        NOT NULL
);
CREATE TABLE gabay.Venue (
    VenueId              INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_Venue PRIMARY KEY,
    TenantId             INT                NOT NULL,
    Name                 VARCHAR(120)       NOT NULL,   -- a comment
    Notes                TEXT               NULL,
    Price                DECIMAL(18,4)      NOT NULL,
    Opened               DATE               NULL,
    IsActive             BOOLEAN            NOT NULL DEFAULT TRUE,
    Code VARCHAR(10) NOT NULL, Label VARCHAR(30) NULL,
    LevelId              INT                NOT NULL
                         CONSTRAINT FK_Venue_Level REFERENCES gabay.Level (LevelId),
    Tags                 INT[]              NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    CONSTRAINT UQ_Venue_Code UNIQUE (TenantId, Code)
);
`;

/** Writes { 'relative/path': 'content' } into a new temp directory and returns it. */
function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gabay-lint-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

/** Runs one linter over a fresh tree; returns its violations. `extra` overrides run options. */
function lint(name, files, extra = {}) {
  const root = tree(files);
  try {
    const { results } = runLinters({ names: [name], files: null, staged: false, base: null, root, ...extra });
    return results[0].violations;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/** "file:line:rule" for each violation, for exact comparison. */
const at = (violations) => violations.map((v) => `${v.file}:${v.line}:${v.rule}`);

module.exports = { SCHEMA, tree, lint, at };
