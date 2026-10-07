/* =====================================================================
   Gabay — db/schema.sql  (PostgreSQL)
   DRAFT 0.14 · 2026-10-07 · for the P0 gate review
   0.14 (plan L121): an admin may belong to several tenants. AppUser.TenantId removed: a user's tenants
        are their UserRole rows (platform staff hold SUPERADMIN with TenantId NULL); UQ_UserRole added.
        Still 56 tables. Run twice on PostgreSQL 18.6 (see L121).
   0.13 (plan L115): FIRST RUN. PostgreSQL 18.6 on the developer's machine (local first, L109), psql -v ON_ERROR_STOP=1,
        twice on one database: both runs exit 0 with no errors (only the teardown's "does not exist, skipping"
        notices on the first); 56 tables, 132 indexes, 1 trigger. No table changes. The C.1 read is by the
        product owner, a non-author, with db/SCHEMA_READING_GUIDE.md.
   0.12 (plan L111, L112): the map's "up" angle, Venue.MapUpDeg and Building.MapUpDeg (NULL = the venue's);
        an optional SpokenName, what the voice says, on Occupant, Level and NavConnector. Still 56 tables.
   0.11 (plan L109): weather dropped from forecasts for now; WeatherSignal removed. 56 tables.
   NOT RUN, as 0.7.
   0.10 (plan L108): drafts generated from uploaded plans. Unit, Opening, FloorObject and NavConnector
   gain NeedsReview and DraftConfidence, each with a partial index for publish's review check. Still 57
   tables. NOT RUN, as 0.7.
   0.9 (plan L107): QR removed from the product. Anchor.QrCode and UX_Anchor_QrCode dropped;
   IX_Anchor_Level added. Still 57 tables. NOT RUN, as 0.7.
   0.8 (plan L104, L105): the admin dashboard adopts the spike's analytics (L71) and gains
   forecasts. Eleven tables added (57 in all): AnalyticsEvent; AnalyticsDailyVenue,
   AnalyticsDailyUnit, AnalyticsDailyCell and AnalyticsDailyEdge (the nightly roll-up);
   StoreStatusChange (the status history the status-impact figures need); Holiday, MallEvent,
   FootfallCount, WeatherSignal and Forecast. RouteTrace now holds one visit session's dots
   (SessionId added; DestinationUnitId removed, destinations are AnalyticsEvent rows;
   TraceGeoJson renamed TracePoints). Occupant gains its composite-FK target. StoredFile.Purpose
   gains FOOTFALL_CSV. The L42 legal gate still holds for every table fed by shoppers' data.
   NOT RUN, as 0.7.
   0.7 (plan L98, Firebase end to end): the schema is now PostgreSQL, for Cloud SQL through
   Firebase SQL Connect (EXCEPTIONS E-06; approved by the product owner, lead countersignature
   open). The superseded T-SQL version is kept as db/schema.mssql.sql. Same tables and columns
   as 0.6 except:
   - RefreshToken removed, and AppUser's PasswordHash, FailedLoginCount, LockedUntil,
     ActiveSessionId, ChangePassword and PasswordChangedAt removed: Firebase Auth holds
     credentials, refresh and lockout (E-08). AppUser.FirebaseUid and ShopperAccount.FirebaseUid
     added; ShopperAccount.PasswordHash and ProviderSubject removed.
   - Type mapping: INT IDENTITY(1,1) -> INT GENERATED ALWAYS AS IDENTITY; NVARCHAR(n) -> VARCHAR(n);
     NVARCHAR(MAX) + ISJSON -> JSONB; BIT -> BOOLEAN; DATETIME2(3) -> TIMESTAMPTZ(3) with now();
     UNIQUEIDENTIFIER -> UUID; VARBINARY -> BYTEA; N'' literals -> ''. DECIMAL stays: PostgreSQL
     treats DECIMAL and NUMERIC as one type (standard rule 1 wording kept).
   - Named DEFAULT constraints dropped (PostgreSQL does not name defaults); every other
     constraint keeps its name. Filtered unique indexes are partial indexes (same syntax).
   - The §8.2 dynamic FK-drop preamble is a DO block over pg_constraint. There is no temporal
     teardown: PostgreSQL has no system versioning, and no Gabay table used it.
   - The Frozen Package trigger is a PL/pgSQL function + BEFORE UPDATE OR DELETE trigger.
   - Identifiers are written PascalCase and never quoted, so PostgreSQL stores them lowercase.
     Code writes them the same way; nothing is ever quoted.
   - NOT RUN: no PostgreSQL client or Docker on the author's machine. Statically checked only
     (CREATE/DROP pairing, no MSSQL types left). First run on the SQL Connect instance at P1.
     0.13: superseded. First run locally on PostgreSQL 18.6 (L115); Cloud SQL at the first deploy.
   0.6 (plan L92, Demo Prototype 4): comment only. Unit.PassThrough is the mall's walk-through
   mark; no table or column changes.
   0.5 (plan L86-L88, the demo app): ShopperReport, ReportCategory and ReportStatus removed (no
   everyday shopper reports); connector metre costs on ConnectorType; the lift time-model columns
   removed from NavConnector; evacuation-only stairs, per-venue escalator use in an evacuation,
   and door clear widths added.
   0.4 (plan L83): StoreStatus lookup on Occupant, following the 3D navigation mock-up standard.
   0.3 (plan 0.32): the BeaconPlanItem mount-height comment follows L45.
   0.2 (plan.html L81): §8.2 dynamic FK-drop preamble and temporal teardown;
   §3.4 Layer 2 permissions (role and per-user route x CRUD); §3.6 AuditLog
   shape; session columns and RefreshToken; ReportStatus lookup replaces
   ShopperReport's CHECK list; composite FKs to every tenant-scoped parent;
   VenueId on FloorUnderlay and the sentinel readings; authority comments on
   every closed set; a "serves" note on every index.
   (Appendix C.1 Phase 0: "schema.sql exists and has been read by someone
   other than its author". Reviewer: Allan Young, or Raphael Mendoza; L115: the product owner,
   under Raphael Mendoza's delegation. Signed: Genesis Perez (product owner)  Date: 2026-10-07
   (plan L122: read as DRAFT 0.14, no changes; the P0 gate is met))

   Source of truth for intent: GABAY_MASTER_BLUEPRINT.md Part 3.
   Re-runnable: every CREATE TABLE has a matching DROP TABLE. The drops run
   in reverse dependency order, the creates in dependency order.

   Conventions (Blueprint Part 3):
   - Tables singular PascalCase; columns PascalCase; FKs <Table>Id. Schema: gabay.
   - Money DECIMAL(18,4). Metres DECIMAL(9,3). No FLOAT, REAL or DOUBLE PRECISION anywhere.
   - Timestamps TIMESTAMPTZ(3) in UTC (standard §3.9/§3.10). Defaults use now().
   - Tenant-scoped tables carry TenantId. Child tables reference parents by
     composite (TenantId, <Parent>Id) FKs, so a cross-tenant link is refused
     by the database, not only by the predicate lint (invariant 13 / Two-Predicate).
   - Exception, by design: FKs to a lookup table, to AppUser and to a StoredFile
     that may be platform-owned are single-column. Their TenantId may be NULL
     (a platform-wide row), and a composite FK cannot express "the same tenant
     or the platform". DESIGN CHOICE: the lookup service (§3.19) and the write
     services check "same tenant or platform" on every write. The alternative is
     a BEFORE INSERT OR UPDATE trigger per referencing table, more SQL to maintain
     for the same rule.
   - Audit columns: CreatedBy, CreatedAt, UpdatedBy, UpdatedAt, filled from the
     actor context (standard §3.18). They have no FK to AppUser on purpose,
     which avoids a bootstrap cycle.
   - Lookup tables: TenantId NULL = platform-wide (SuperAdmin-owned);
     non-NULL = a tenant's own value. IsActive; never hard-deleted while
     referenced (standard §3.19).
   - Closed system sets (CHECK lists) mirror the ONE shared constants file
     (standard §4.10 narrow exception, Blueprint invariant 14). Each is a set
     whose every value carries its own code, and each CHECK carries a comment
     stating its authority and why it is closed. A set a client could ask to
     extend is a lookup table instead (L83: store status is one).
   ===================================================================== */

CREATE SCHEMA IF NOT EXISTS gabay;
SET search_path TO gabay, public;

/* ---------------------------------------------------------------------
   Dynamic FK-drop preamble (standard §8.2): drop every foreign key in the
   gabay schema first, so the script re-runs whatever state an earlier run or
   a migration left. Gabay owns the gabay schema of its database.
   --------------------------------------------------------------------- */
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT c.conname, n.nspname, t.relname
        FROM pg_constraint AS c
        JOIN pg_class AS t ON t.oid = c.conrelid
        JOIN pg_namespace AS n ON n.oid = t.relnamespace
        WHERE c.contype = 'f' AND n.nspname = 'gabay'
    LOOP
        EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I;', r.nspname, r.relname, r.conname);
    END LOOP;
END $$;

/* ---------------------------------------------------------------------
   Temporal teardown (standard §8.2): none. PostgreSQL has no system
   versioning, and no Gabay table used it (Blueprint Part 3, temporal policy).
   --------------------------------------------------------------------- */

/* ---------------------------------------------------------------------
   DROP (reverse dependency order)
   --------------------------------------------------------------------- */
DROP TABLE IF EXISTS gabay.ChangelogEntry        CASCADE;
DROP TABLE IF EXISTS gabay.AppVersion            CASCADE;
DROP TABLE IF EXISTS gabay.AuditLog              CASCADE;
DROP TABLE IF EXISTS gabay.Forecast              CASCADE;
DROP TABLE IF EXISTS gabay.FootfallCount         CASCADE;
DROP TABLE IF EXISTS gabay.MallEvent             CASCADE;
DROP TABLE IF EXISTS gabay.Holiday               CASCADE;
DROP TABLE IF EXISTS gabay.StoreStatusChange     CASCADE;
DROP TABLE IF EXISTS gabay.AnalyticsDailyEdge    CASCADE;
DROP TABLE IF EXISTS gabay.AnalyticsDailyCell    CASCADE;
DROP TABLE IF EXISTS gabay.AnalyticsDailyUnit    CASCADE;
DROP TABLE IF EXISTS gabay.AnalyticsDailyVenue   CASCADE;
DROP TABLE IF EXISTS gabay.AnalyticsEvent        CASCADE;
DROP TABLE IF EXISTS gabay.RouteTrace            CASCADE;
DROP TABLE IF EXISTS gabay.AnalyticsConsent      CASCADE;
DROP TABLE IF EXISTS gabay.ShopperAccount        CASCADE;
DROP TABLE IF EXISTS gabay.Closure               CASCADE;
DROP TABLE IF EXISTS gabay.SentinelReadingDaily  CASCADE;
DROP TABLE IF EXISTS gabay.SentinelReadingHourly CASCADE;
DROP TABLE IF EXISTS gabay.Sentinel              CASCADE;
DROP TABLE IF EXISTS gabay.Beacon                CASCADE;
DROP TABLE IF EXISTS gabay.BeaconPlanItem        CASCADE;
DROP TABLE IF EXISTS gabay.BeaconPlan            CASCADE;
DROP TABLE IF EXISTS gabay.VenueVersion          CASCADE;
DROP FUNCTION IF EXISTS gabay.tr_venueversion_frozen() CASCADE;
DROP TABLE IF EXISTS gabay.NavCorrection         CASCADE;
DROP TABLE IF EXISTS gabay.NavConnectorStop      CASCADE;
DROP TABLE IF EXISTS gabay.NavConnector          CASCADE;
DROP TABLE IF EXISTS gabay.Anchor                CASCADE;
DROP TABLE IF EXISTS gabay.TransitPoint          CASCADE;
DROP TABLE IF EXISTS gabay.Amenity               CASCADE;
DROP TABLE IF EXISTS gabay.Occupant              CASCADE;
DROP TABLE IF EXISTS gabay.FloorObject           CASCADE;
DROP TABLE IF EXISTS gabay.FloorUnderlay         CASCADE;
DROP TABLE IF EXISTS gabay.Opening               CASCADE;
DROP TABLE IF EXISTS gabay.Unit                  CASCADE;
DROP TABLE IF EXISTS gabay.Level                 CASCADE;
DROP TABLE IF EXISTS gabay.Building              CASCADE;
DROP TABLE IF EXISTS gabay.UserVenueGrant        CASCADE;
DROP TABLE IF EXISTS gabay.Venue                 CASCADE;
DROP TABLE IF EXISTS gabay.StoreStatus           CASCADE;
DROP TABLE IF EXISTS gabay.BeaconModel           CASCADE;
DROP TABLE IF EXISTS gabay.ObjectType            CASCADE;
DROP TABLE IF EXISTS gabay.ConnectorType         CASCADE;
DROP TABLE IF EXISTS gabay.TransitType           CASCADE;
DROP TABLE IF EXISTS gabay.AmenityType           CASCADE;
DROP TABLE IF EXISTS gabay.OccupantCategory      CASCADE;
DROP TABLE IF EXISTS gabay.BuildingType          CASCADE;
DROP TABLE IF EXISTS gabay.StoredFile            CASCADE;
DROP TABLE IF EXISTS gabay.GlobalSetting         CASCADE;
DROP TABLE IF EXISTS gabay.UserRole              CASCADE;
DROP TABLE IF EXISTS gabay.UserPermission        CASCADE;
DROP TABLE IF EXISTS gabay.RolePermission        CASCADE;
DROP TABLE IF EXISTS gabay.PermissionRoute       CASCADE;
DROP TABLE IF EXISTS gabay.Role                  CASCADE;
DROP TABLE IF EXISTS gabay.AppUser               CASCADE;
DROP TABLE IF EXISTS gabay.Tenant                CASCADE;

/* ---------------------------------------------------------------------
   1. Platform, identity, access (standard §3.3–§3.5; roles L41; L98 Firebase Auth)
   --------------------------------------------------------------------- */
CREATE TABLE gabay.Tenant (
    TenantId             INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_Tenant PRIMARY KEY,
    Code                 VARCHAR(40)        NOT NULL,
    Name                 VARCHAR(200)       NOT NULL,
    BeaconProximityUuid  UUID               NULL,   -- invariant 9: one Gabay-assigned UUID per tenant
    IsActive             BOOLEAN            NOT NULL DEFAULT TRUE,
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT UQ_Tenant_Code UNIQUE (Code),
    CONSTRAINT UQ_Tenant_TenantId_Uuid UNIQUE (TenantId, BeaconProximityUuid)  -- target of Beacon's composite FK
);
CREATE UNIQUE INDEX UX_Tenant_BeaconProximityUuid ON gabay.Tenant (BeaconProximityUuid)
    WHERE BeaconProximityUuid IS NOT NULL;  -- serves: namespace uniqueness across the platform

-- L98 (E-08): credentials, refresh, lockout and single-session live in Firebase Auth. The API verifies the
-- Firebase ID token and maps its UID to this row. Email and DisplayName are copies for display and search,
-- refreshed from the token on sign-in. The 0.6 columns PasswordHash, FailedLoginCount, LockedUntil,
-- ActiveSessionId, ChangePassword and PasswordChangedAt are gone, as is the RefreshToken table.
CREATE TABLE gabay.AppUser (
    UserId               INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_AppUser PRIMARY KEY,
    -- 0.14 (L121): no TenantId. A user may belong to several tenants; the tenants are the UserRole rows,
    -- and the request's tenant is chosen per request and checked against them (Blueprint DC28).
    FirebaseUid          VARCHAR(128)       NOT NULL,  -- the Firebase Auth UID (E-08)
    Email                VARCHAR(254)       NOT NULL,
    DisplayName          VARCHAR(120)       NOT NULL,
    IsActive             BOOLEAN            NOT NULL DEFAULT TRUE,  -- FALSE = access revoked here even if the Firebase user still exists
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT UQ_AppUser_Email UNIQUE (Email),
    CONSTRAINT UQ_AppUser_FirebaseUid UNIQUE (FirebaseUid)  -- serves: the UID -> user lookup on every request
);

CREATE TABLE gabay.Role (
    RoleId               INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_Role PRIMARY KEY,
    Code                 VARCHAR(40)        NOT NULL,   -- seeded: SUPERADMIN, MALL_ADMIN, VENUE_EDITOR, VIEWER;
                                                        -- next release: MERCHANT, UNIT, MAINTENANCE (L41)
    Label                VARCHAR(100)       NOT NULL,
    IsPlatformRole       BOOLEAN            NOT NULL DEFAULT FALSE,
    IsActive             BOOLEAN            NOT NULL DEFAULT TRUE,
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT UQ_Role_Code UNIQUE (Code)
);

-- Standard §3.4 Layer 2: route x Create/Read/Update/Delete. One row per guarded API route group,
-- seeded by migration as routes are built (a route exists only in code, so this list follows the code).
CREATE TABLE gabay.PermissionRoute (
    PermissionRouteId    INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_PermissionRoute PRIMARY KEY,
    RouteKey             VARCHAR(80)        NOT NULL,   -- e.g. venues, editor-drafts, venue-versions, beacons
    Label                VARCHAR(200)       NOT NULL,
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT UQ_PermissionRoute_Key UNIQUE (RouteKey)  -- serves: guard lookup by route key
);

-- The role row is the default. Publishing is Create on venue-versions, which the Venue Editor role lacks (L41).
-- A user holding several roles gets the OR of their role rows.
CREATE TABLE gabay.RolePermission (
    RoleId               INT                NOT NULL CONSTRAINT FK_RolePermission_Role REFERENCES gabay.Role (RoleId),
    PermissionRouteId    INT                NOT NULL CONSTRAINT FK_RolePermission_Route REFERENCES gabay.PermissionRoute (PermissionRouteId),
    CanCreate            BOOLEAN            NOT NULL DEFAULT FALSE,
    CanRead              BOOLEAN            NOT NULL DEFAULT FALSE,
    CanUpdate            BOOLEAN            NOT NULL DEFAULT FALSE,
    CanDelete            BOOLEAN            NOT NULL DEFAULT FALSE,
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT PK_RolePermission PRIMARY KEY (RoleId, PermissionRouteId)  -- serves: permission merge at sign-in and in the guard
);

-- Per-user rows REPLACE the merged role row for that route (§3.4); the same merge runs at sign-in and in the guard.
CREATE TABLE gabay.UserPermission (
    UserId               INT                NOT NULL CONSTRAINT FK_UserPermission_User REFERENCES gabay.AppUser (UserId),
    PermissionRouteId    INT                NOT NULL CONSTRAINT FK_UserPermission_Route REFERENCES gabay.PermissionRoute (PermissionRouteId),
    CanCreate            BOOLEAN            NOT NULL DEFAULT FALSE,
    CanRead              BOOLEAN            NOT NULL DEFAULT FALSE,
    CanUpdate            BOOLEAN            NOT NULL DEFAULT FALSE,
    CanDelete            BOOLEAN            NOT NULL DEFAULT FALSE,
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT PK_UserPermission PRIMARY KEY (UserId, PermissionRouteId)  -- serves: permission merge at sign-in and in the guard
);

CREATE TABLE gabay.UserRole (
    UserRoleId           INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_UserRole PRIMARY KEY,
    UserId               INT                NOT NULL CONSTRAINT FK_UserRole_User REFERENCES gabay.AppUser (UserId),
    RoleId               INT                NOT NULL CONSTRAINT FK_UserRole_Role REFERENCES gabay.Role (RoleId),
    TenantId             INT                NULL CONSTRAINT FK_UserRole_Tenant REFERENCES gabay.Tenant (TenantId),
                                            -- NULL only for platform roles
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT UQ_UserRole UNIQUE NULLS NOT DISTINCT (UserId, RoleId, TenantId)  -- 0.14 (L121); serves: the user's tenants and roles on every request
);
CREATE UNIQUE INDEX UX_UserRole ON gabay.UserRole (UserId, RoleId, TenantId);  -- serves: permission merge per user at sign-in

CREATE TABLE gabay.GlobalSetting (
    GlobalSettingId      INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_GlobalSetting PRIMARY KEY,
    TenantId             INT                NULL CONSTRAINT FK_GlobalSetting_Tenant REFERENCES gabay.Tenant (TenantId),
                                            -- NULL = platform default; non-NULL = tenant override (§3.16)
    SettingKey           VARCHAR(80)        NOT NULL,   -- e.g. auth.idTokenMaxAgeS (L98), routing.anotherWayAheadM, planner.storeCrossingFactor
    SettingValue         VARCHAR(400)       NOT NULL,
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL
);
CREATE UNIQUE INDEX UX_GlobalSetting ON gabay.GlobalSetting (TenantId, SettingKey);  -- serves: resolver lookup

CREATE TABLE gabay.StoredFile (
    FileId               BIGINT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_StoredFile PRIMARY KEY,
    TenantId             INT                NULL CONSTRAINT FK_StoredFile_Tenant REFERENCES gabay.Tenant (TenantId),
    Purpose              VARCHAR(20)        NOT NULL CONSTRAINT CK_StoredFile_Purpose
                             CHECK (Purpose IN ('LOGO', 'UNDERLAY', 'PACKAGE', 'CAD_IMPORT', 'FOOTFALL_CSV')),  -- §3.15; constants file; closed: each purpose has its own upload validation and storage path in code. FOOTFALL_CSV: L105
    MimeType             VARCHAR(100)       NOT NULL,
    SizeBytes            BIGINT             NOT NULL,
    Sha256               CHAR(64)           NOT NULL,
    StoragePath          VARCHAR(400)       NOT NULL,  -- L98: the Cloud Storage object path (bucket/object), never a local path
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT UQ_StoredFile_Tenant_File UNIQUE (TenantId, FileId)  -- composite-FK target for tenant-owned files
);
-- No secondary index: StoredFile is always fetched by FileId (the primary key).

/* ---------------------------------------------------------------------
   2. Lookup tables (standard §3.19; served by /api/lookups/:name)
      TenantId NULL = platform-wide default owned by SuperAdmin (L41).
   --------------------------------------------------------------------- */
CREATE TABLE gabay.BuildingType (
    BuildingTypeId INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_BuildingType PRIMARY KEY,
    TenantId INT NULL CONSTRAINT FK_BuildingType_Tenant REFERENCES gabay.Tenant (TenantId),
    Code VARCHAR(40) NOT NULL, Label VARCHAR(100) NOT NULL,          -- MAIN, WING, ANNEX, PARKING
    SortOrder INT NOT NULL DEFAULT 0,
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedBy INT NULL, CreatedAt TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    UpdatedBy INT NULL, UpdatedAt TIMESTAMPTZ(3) NULL
);
CREATE UNIQUE INDEX UX_BuildingType_Code ON gabay.BuildingType (TenantId, Code);  -- serves: code uniqueness per tenant; /api/lookups/:name

CREATE TABLE gabay.OccupantCategory (
    OccupantCategoryId INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_OccupantCategory PRIMARY KEY,
    TenantId INT NULL CONSTRAINT FK_OccupantCategory_Tenant REFERENCES gabay.Tenant (TenantId),
    Code VARCHAR(40) NOT NULL, Label VARCHAR(100) NOT NULL,          -- FASHION, DINING, SERVICES, ...
    SortOrder INT NOT NULL DEFAULT 0,
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedBy INT NULL, CreatedAt TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    UpdatedBy INT NULL, UpdatedAt TIMESTAMPTZ(3) NULL
);
CREATE UNIQUE INDEX UX_OccupantCategory_Code ON gabay.OccupantCategory (TenantId, Code);  -- serves: code uniqueness per tenant; /api/lookups/:name

CREATE TABLE gabay.AmenityType (
    AmenityTypeId INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_AmenityType PRIMARY KEY,
    TenantId INT NULL CONSTRAINT FK_AmenityType_Tenant REFERENCES gabay.Tenant (TenantId),
    Code VARCHAR(40) NOT NULL, Label VARCHAR(100) NOT NULL,          -- CR, CR_PWD, NURSING, PRAYER, FIRST_AID,
                                                                     -- SECURITY, INFO, ATM (L29), EV_CHARGING,
                                                                     -- REFUGE_AREA, ASSEMBLY_AREA (L87, evacuation)
    SearchSynonyms VARCHAR(400) NULL,                                -- e.g. "comfort room, restroom, toilet"
    IsAccessible BOOLEAN NOT NULL DEFAULT FALSE,
    SortOrder INT NOT NULL DEFAULT 0,
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedBy INT NULL, CreatedAt TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    UpdatedBy INT NULL, UpdatedAt TIMESTAMPTZ(3) NULL
);
CREATE UNIQUE INDEX UX_AmenityType_Code ON gabay.AmenityType (TenantId, Code);  -- serves: code uniqueness per tenant; /api/lookups/:name

CREATE TABLE gabay.TransitType (
    TransitTypeId INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_TransitType PRIMARY KEY,
    TenantId INT NULL CONSTRAINT FK_TransitType_Tenant REFERENCES gabay.Tenant (TenantId),
    Code VARCHAR(40) NOT NULL, Label VARCHAR(100) NOT NULL,          -- TRAIN_BRIDGE, TERMINAL, JEEPNEY_BAY,
                                                                     -- TAXI_BAY, PARKING_ENTRY, DROP_OFF (L30)
    SortOrder INT NOT NULL DEFAULT 0,
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedBy INT NULL, CreatedAt TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    UpdatedBy INT NULL, UpdatedAt TIMESTAMPTZ(3) NULL
);
CREATE UNIQUE INDEX UX_TransitType_Code ON gabay.TransitType (TenantId, Code);  -- serves: code uniqueness per tenant; /api/lookups/:name

CREATE TABLE gabay.ConnectorType (
    ConnectorTypeId INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_ConnectorType PRIMARY KEY,
    TenantId INT NULL CONSTRAINT FK_ConnectorType_Tenant REFERENCES gabay.Tenant (TenantId),
    Code VARCHAR(40) NOT NULL, Label VARCHAR(100) NOT NULL,
    CostModel VARCHAR(20) NOT NULL CONSTRAINT CK_ConnectorType_CostModel
        CHECK (CostModel IN ('ESCALATOR', 'STAIRS', 'ELEVATOR', 'RAMP', 'LEVEL')),  -- constants file; closed: each value is a connector behaviour in code (step-free, evacuation); connector TYPES are this lookup
    IsStepFree BOOLEAN NOT NULL,                                      -- L37 step-free mode filter
    -- L86: routes are ranked by metres. A floor change costs CostBaseM + CostPerRiseM x the height climbed (m),
    -- tunable per type by the mall. Demo defaults: lift 30 + 1.5, stairs 34 + 3, escalator 14 + 1, ramp 20 + 2.
    CostBaseM DECIMAL(9,3) NOT NULL DEFAULT 0,
    CostPerRiseM DECIMAL(9,3) NOT NULL DEFAULT 0,
    SortOrder INT NOT NULL DEFAULT 0,
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedBy INT NULL, CreatedAt TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    UpdatedBy INT NULL, UpdatedAt TIMESTAMPTZ(3) NULL
);
CREATE UNIQUE INDEX UX_ConnectorType_Code ON gabay.ConnectorType (TenantId, Code);  -- serves: code uniqueness per tenant; /api/lookups/:name

CREATE TABLE gabay.ObjectType (
    ObjectTypeId INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_ObjectType PRIMARY KEY,
    TenantId INT NULL CONSTRAINT FK_ObjectType_Tenant REFERENCES gabay.Tenant (TenantId),
    Code VARCHAR(40) NOT NULL, Label VARCHAR(100) NOT NULL,          -- PILLAR, KIOSK, STALL, BENCH, PLANTER, ... (L39 library)
    DefaultWidthM DECIMAL(9,3) NULL, DefaultDepthM DECIMAL(9,3) NULL, DefaultHeightM DECIMAL(9,3) NULL,
    BlocksWalk BOOLEAN NOT NULL DEFAULT TRUE,
    SignalPenaltyDb DECIMAL(5,2) NULL,                                -- L40 RSSI model penalty (e.g. concrete pillar)
    SortOrder INT NOT NULL DEFAULT 0,
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedBy INT NULL, CreatedAt TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    UpdatedBy INT NULL, UpdatedAt TIMESTAMPTZ(3) NULL
);
CREATE UNIQUE INDEX UX_ObjectType_Code ON gabay.ObjectType (TenantId, Code);  -- serves: code uniqueness per tenant; /api/lookups/:name

CREATE TABLE gabay.BeaconModel (
    BeaconModelId INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_BeaconModel PRIMARY KEY,
    TenantId INT NULL CONSTRAINT FK_BeaconModel_Tenant REFERENCES gabay.Tenant (TenantId),
    Code VARCHAR(40) NOT NULL, Label VARCHAR(100) NOT NULL,
    UnitPrice DECIMAL(18,4) NULL,                                     -- admin-entered; L40 cost estimate
    BatteryLifeMonths INT NULL,
    IpRating VARCHAR(10) NULL,                                        -- e.g. IP67 for semi-outdoor mounts
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedBy INT NULL, CreatedAt TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    UpdatedBy INT NULL, UpdatedAt TIMESTAMPTZ(3) NULL
);
CREATE UNIQUE INDEX UX_BeaconModel_Code ON gabay.BeaconModel (TenantId, Code);  -- serves: code uniqueness per tenant; /api/lookups/:name

-- L83: store status, as the 3D navigation mock-up shows it on pins and place cards. Mall-extensible (§4.10).
-- Seeded platform rows (reference seed): OPEN (IsRoutable TRUE), CLOSED, MAINTENANCE ("Being repaired"),
-- COMING_SOON ("Opening soon"), all IsRoutable FALSE. The mock-up dims a non-routable pin and disables Go;
-- code reads IsRoutable, never a code string. Complete per §4.10: seed rows, an allow-list entry, a maintenance
-- screen and its permission route, at Phase 1.
CREATE TABLE gabay.StoreStatus (
    StoreStatusId INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_StoreStatus PRIMARY KEY,
    TenantId INT NULL CONSTRAINT FK_StoreStatus_Tenant REFERENCES gabay.Tenant (TenantId),
    Code VARCHAR(40) NOT NULL, Label VARCHAR(100) NOT NULL,
    IsRoutable BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE = shoppers can start a route to it
    SortOrder INT NOT NULL DEFAULT 0,
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedBy INT NULL, CreatedAt TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    UpdatedBy INT NULL, UpdatedAt TIMESTAMPTZ(3) NULL
);
CREATE UNIQUE INDEX UX_StoreStatus_Code ON gabay.StoreStatus (TenantId, Code);  -- serves: code uniqueness per tenant; /api/lookups/:name

/* ---------------------------------------------------------------------
   3. Venue model: whole site (L30), nested facilities (L29), editor (L39)
      Coordinates: local planar metres per level (invariant 2).
      Geometry: GeoJSON in JSONB (the type validates the JSON; invalid JSON
      is refused on write). No PostGIS: planar metres need none (0.3 rule).
   --------------------------------------------------------------------- */
CREATE TABLE gabay.Venue (
    VenueId              INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_Venue PRIMARY KEY,
    TenantId             INT                NOT NULL CONSTRAINT FK_Venue_Tenant REFERENCES gabay.Tenant (TenantId),
    Code                 VARCHAR(40)        NOT NULL,
    Name                 VARCHAR(200)       NOT NULL,
    BoundaryGeoJson      JSONB              NOT NULL,  -- invariant 10: the whole property (L30)
    GeoreferenceJson     JSONB              NULL,      -- local metres -> WGS84 transform; needed for the GNSS outdoor dot (L31)
    EvacEscalatorsAllowed BOOLEAN           NOT NULL DEFAULT TRUE,  -- L87: the mall's safety plan; the demo allows them
    MapUpDeg             DECIMAL(6,2)       NOT NULL DEFAULT 0
                             CONSTRAINT CK_Venue_MapUpDeg CHECK (MapUpDeg >= 0 AND MapUpDeg < 360),  -- L111: the map's "up" when not turning, plan degrees clockwise from +Y (DC24)
    IsActive             BOOLEAN            NOT NULL DEFAULT TRUE,
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT UQ_Venue_Tenant_Code UNIQUE (TenantId, Code),
    CONSTRAINT UQ_Venue_Tenant_Venue UNIQUE (TenantId, VenueId)   -- composite-FK target
);

CREATE TABLE gabay.UserVenueGrant (
    UserVenueGrantId     INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_UserVenueGrant PRIMARY KEY,
    TenantId             INT                NOT NULL,
    UserId               INT                NOT NULL CONSTRAINT FK_UserVenueGrant_User REFERENCES gabay.AppUser (UserId),
    VenueId              INT                NOT NULL,
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT FK_UserVenueGrant_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT UQ_UserVenueGrant UNIQUE (UserId, VenueId)          -- serves: per-venue authorization check
);

CREATE TABLE gabay.Building (
    BuildingId           INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_Building PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    BuildingTypeId       INT                NOT NULL CONSTRAINT FK_Building_Type REFERENCES gabay.BuildingType (BuildingTypeId),
    Name                 VARCHAR(200)       NOT NULL,
    FootprintGeoJson     JSONB              NULL,
    MapUpDeg             DECIMAL(6,2)       NULL
                             CONSTRAINT CK_Building_MapUpDeg CHECK (MapUpDeg >= 0 AND MapUpDeg < 360),  -- L111: NULL = the venue's (DC24)
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT FK_Building_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT UQ_Building_Tenant_Building UNIQUE (TenantId, BuildingId)
);
CREATE INDEX IX_Building_Venue ON gabay.Building (TenantId, VenueId);  -- serves: site load in the editor, package build

CREATE TABLE gabay.Level (
    LevelId              INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_Level PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    BuildingId           INT                NULL,      -- NULL = outdoor ground of the venue (L30)
    Ordinal              INT                NOT NULL,  -- IMDF-style: 0 ground, negative below
    Name                 VARCHAR(100)       NOT NULL,
    ShortName            VARCHAR(10)        NOT NULL,
    SpokenName           VARCHAR(100)       NULL,      -- L112: what the voice says, e.g. "Upper Ground" for UG; NULL = Name
    IsOutdoor            BOOLEAN            NOT NULL DEFAULT FALSE,
    ElevationM           DECIMAL(9,3)       NOT NULL DEFAULT 0,
    WidthM               DECIMAL(9,3)       NOT NULL,  -- editor floor size (L39), e.g. 40.000
    DepthM               DECIMAL(9,3)       NOT NULL,
    GridCellM            DECIMAL(5,2)       NOT NULL DEFAULT 1.00
                             CONSTRAINT CK_Level_GridCell CHECK (GridCellM BETWEEN 0.25 AND 2.00),
    CeilingHeightM       DECIMAL(5,2)       NULL,      -- L40 mount-height candidates
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT FK_Level_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT FK_Level_Building FOREIGN KEY (TenantId, BuildingId) REFERENCES gabay.Building (TenantId, BuildingId),
    CONSTRAINT CK_Level_OutdoorBuilding CHECK ((IsOutdoor AND BuildingId IS NULL) OR (NOT IsOutdoor AND BuildingId IS NOT NULL)),
    CONSTRAINT UQ_Level_Tenant_Level UNIQUE (TenantId, LevelId)
);
CREATE INDEX IX_Level_Venue ON gabay.Level (TenantId, VenueId, Ordinal);  -- serves: editor floor list, package build

CREATE TABLE gabay.Unit (
    UnitId               INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_Unit PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    LevelId              INT                NOT NULL,
    ParentUnitId         INT                NULL,
                                            -- nested facility interiors and sections (L29)
    ImdfCategory         VARCHAR(40)        NOT NULL,  -- IMDF 1.0.0 unit category; constants file
    Name                 VARCHAR(200)       NULL,
    ShapeKind            VARCHAR(10)        NOT NULL CONSTRAINT CK_Unit_Shape CHECK (ShapeKind IN ('BOX', 'POLYGON')),  -- L39; constants file; closed: each kind is geometry code
    CenterX              DECIMAL(9,3)       NULL, CenterY DECIMAL(9,3) NULL,
    WidthM               DECIMAL(9,3)       NULL, DepthM  DECIMAL(9,3) NULL,
    RotationDeg          DECIMAL(6,2)       NULL,
    GeometryGeoJson      JSONB              NOT NULL,  -- always stored; derived from box params when ShapeKind = BOX
    IsWalkable           BOOLEAN            NOT NULL,  -- corridors/walkways/open areas = TRUE; stores' interiors via children
    PassThrough          BOOLEAN            NOT NULL DEFAULT FALSE,  -- the mall's walk-through mark (L29, L92): a shortcut only when open and the shopper allows it; publish makes it a passage where it is the only way to a place
    NeedsReview          BOOLEAN            NOT NULL DEFAULT FALSE,  -- L108: generated from an uploaded plan and not yet confirmed; publish refuses while any is TRUE
    DraftConfidence      DECIMAL(4,3)       NULL CONSTRAINT CK_Unit_DraftConfidence CHECK (DraftConfidence BETWEEN 0 AND 1),  -- L108: the generator's confidence (low ones are highlighted); NULL = drawn by hand
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT FK_Unit_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT FK_Unit_Level FOREIGN KEY (TenantId, LevelId) REFERENCES gabay.Level (TenantId, LevelId),
    CONSTRAINT CK_Unit_BoxParams CHECK (ShapeKind = 'POLYGON' OR (CenterX IS NOT NULL AND CenterY IS NOT NULL AND WidthM > 0 AND DepthM > 0)),
    CONSTRAINT UQ_Unit_Tenant_Unit UNIQUE (TenantId, UnitId)
);
-- Self-reference added after the table exists, so its composite target UQ_Unit_Tenant_Unit is in place.
ALTER TABLE gabay.Unit ADD CONSTRAINT FK_Unit_Parent FOREIGN KEY (TenantId, ParentUnitId) REFERENCES gabay.Unit (TenantId, UnitId);
CREATE INDEX IX_Unit_Level ON gabay.Unit (TenantId, LevelId);  -- serves: editor floor load, walkable-area derivation
CREATE INDEX IX_Unit_NeedsReview ON gabay.Unit (TenantId, VenueId) WHERE NeedsReview;  -- serves: publish's "anything unreviewed?" check; the editor's review list (L108)

CREATE TABLE gabay.Opening (
    OpeningId            INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_Opening PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    LevelId              INT                NOT NULL,
    UnitId               INT                NULL,
    ImdfCategory         VARCHAR(40)        NOT NULL,  -- IMDF opening category; constants file
    Name                 VARCHAR(200)       NULL,
    GeometryGeoJson      JSONB              NOT NULL,
    IsVenueEntrance      BOOLEAN            NOT NULL DEFAULT FALSE,  -- L31 handoff pairs; L40 mandatory beacons
    ClearWidthM          DECIMAL(9,3)       NULL,      -- L88: step-free routes avoid doors under the 1.2 m setting; NULL = not measured
    -- Door direction / access rules deliberately absent: L33 (P2) adds them by migration.
    NeedsReview          BOOLEAN            NOT NULL DEFAULT FALSE,  -- L108: generated from an uploaded plan and not yet confirmed; publish refuses while any is TRUE
    DraftConfidence      DECIMAL(4,3)       NULL CONSTRAINT CK_Opening_DraftConfidence CHECK (DraftConfidence BETWEEN 0 AND 1),  -- L108: the generator's confidence (low ones are highlighted); NULL = drawn by hand
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT FK_Opening_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT FK_Opening_Level FOREIGN KEY (TenantId, LevelId) REFERENCES gabay.Level (TenantId, LevelId),
    CONSTRAINT FK_Opening_Unit FOREIGN KEY (TenantId, UnitId) REFERENCES gabay.Unit (TenantId, UnitId)
);
CREATE INDEX IX_Opening_Level ON gabay.Opening (TenantId, LevelId);  -- serves: editor floor load, door list for the package build
CREATE INDEX IX_Opening_NeedsReview ON gabay.Opening (TenantId, VenueId) WHERE NeedsReview;  -- serves: publish's "anything unreviewed?" check; the editor's review list (L108)

CREATE TABLE gabay.FloorUnderlay (
    FloorUnderlayId      INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_FloorUnderlay PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,  -- 0.2: invariant 13, queried directly by the editor
    LevelId              INT                NOT NULL,
    FileId               BIGINT             NOT NULL,  -- the tenant's own file (composite FK below)
    -- two-point calibration (L39 traced underlay): image pixels A, B and their real distance
    PxAx DECIMAL(9,2) NOT NULL, PxAy DECIMAL(9,2) NOT NULL,
    PxBx DECIMAL(9,2) NOT NULL, PxBy DECIMAL(9,2) NOT NULL,
    RealDistanceM        DECIMAL(9,3)       NOT NULL CONSTRAINT CK_FloorUnderlay_Dist CHECK (RealDistanceM > 0),
    OffsetX DECIMAL(9,3) NOT NULL DEFAULT 0,
    OffsetY DECIMAL(9,3) NOT NULL DEFAULT 0,
    RotationDeg DECIMAL(6,2) NOT NULL DEFAULT 0,
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT FK_FloorUnderlay_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT FK_FloorUnderlay_Level FOREIGN KEY (TenantId, LevelId) REFERENCES gabay.Level (TenantId, LevelId),
    CONSTRAINT FK_FloorUnderlay_File FOREIGN KEY (TenantId, FileId) REFERENCES gabay.StoredFile (TenantId, FileId)
);
CREATE INDEX IX_FloorUnderlay_Level ON gabay.FloorUnderlay (TenantId, VenueId, LevelId);  -- serves: editor underlay load per floor

CREATE TABLE gabay.FloorObject (
    FloorObjectId        INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_FloorObject PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    LevelId              INT                NOT NULL,
    ObjectTypeId         INT                NOT NULL CONSTRAINT FK_FloorObject_Type REFERENCES gabay.ObjectType (ObjectTypeId),
    UnitId               INT                NULL,      -- placed inside a unit (e.g. a kiosk inside an atrium)
    ShapeKind            VARCHAR(10)        NOT NULL CONSTRAINT CK_FloorObject_Shape CHECK (ShapeKind IN ('BOX', 'POLYGON')),  -- L39; constants file; closed: each kind is geometry code
    CenterX DECIMAL(9,3) NOT NULL, CenterY DECIMAL(9,3) NOT NULL,
    WidthM  DECIMAL(9,3) NULL, DepthM DECIMAL(9,3) NULL, HeightM DECIMAL(9,3) NULL,
    RotationDeg          DECIMAL(6,2)       NOT NULL DEFAULT 0,
    GeometryGeoJson      JSONB              NULL,
    BlocksWalk           BOOLEAN            NOT NULL,  -- copied from ObjectType, overridable
    NeedsReview          BOOLEAN            NOT NULL DEFAULT FALSE,  -- L108: generated from an uploaded plan and not yet confirmed; publish refuses while any is TRUE
    DraftConfidence      DECIMAL(4,3)       NULL CONSTRAINT CK_FloorObject_DraftConfidence CHECK (DraftConfidence BETWEEN 0 AND 1),  -- L108: the generator's confidence (low ones are highlighted); NULL = drawn by hand
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT FK_FloorObject_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT FK_FloorObject_Level FOREIGN KEY (TenantId, LevelId) REFERENCES gabay.Level (TenantId, LevelId),
    CONSTRAINT FK_FloorObject_Unit FOREIGN KEY (TenantId, UnitId) REFERENCES gabay.Unit (TenantId, UnitId),
    CONSTRAINT CK_FloorObject_Geom CHECK ((ShapeKind = 'BOX' AND WidthM > 0 AND DepthM > 0) OR (ShapeKind = 'POLYGON' AND GeometryGeoJson IS NOT NULL))
);
CREATE INDEX IX_FloorObject_Level ON gabay.FloorObject (TenantId, LevelId);  -- serves: editor floor load
CREATE INDEX IX_FloorObject_NeedsReview ON gabay.FloorObject (TenantId, VenueId) WHERE NeedsReview;  -- serves: publish's "anything unreviewed?" check; the editor's review list (L108)

CREATE TABLE gabay.Occupant (
    OccupantId           INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_Occupant PRIMARY KEY,
    TenantId             INT                NOT NULL,   -- "tenant" = mall operator; stores are Occupants (invariant 1)
    VenueId              INT                NOT NULL,
    UnitId               INT                NOT NULL,
    OccupantCategoryId   INT                NOT NULL CONSTRAINT FK_Occupant_Category REFERENCES gabay.OccupantCategory (OccupantCategoryId),
    StoreStatusId        INT                NOT NULL CONSTRAINT FK_Occupant_Status REFERENCES gabay.StoreStatus (StoreStatusId),  -- L83; lookup: single-column by design (header)
    Name                 VARCHAR(200)       NOT NULL,
    SearchKeywords       VARCHAR(400)       NULL,       -- FTS5 in the package (D6)
    SpokenName           VARCHAR(200)       NULL,       -- L112: what the voice says; NULL = Name
    LogoFileId           BIGINT             NULL,      -- the tenant's own file (composite FK below)
    IsActive             BOOLEAN            NOT NULL DEFAULT TRUE,
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT FK_Occupant_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT FK_Occupant_Unit FOREIGN KEY (TenantId, UnitId) REFERENCES gabay.Unit (TenantId, UnitId),
    CONSTRAINT FK_Occupant_Logo FOREIGN KEY (TenantId, LogoFileId) REFERENCES gabay.StoredFile (TenantId, FileId),
    CONSTRAINT UQ_Occupant_Tenant_Occupant UNIQUE (TenantId, OccupantId)  -- 0.8: composite-FK target (StoreStatusChange)
);
CREATE INDEX IX_Occupant_Venue ON gabay.Occupant (TenantId, VenueId, IsActive, Name);  -- serves: directory build at publish

CREATE TABLE gabay.Amenity (
    AmenityId            INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_Amenity PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    LevelId              INT                NOT NULL,
    UnitId               INT                NULL,
    AmenityTypeId        INT                NOT NULL CONSTRAINT FK_Amenity_Type REFERENCES gabay.AmenityType (AmenityTypeId),
    Name                 VARCHAR(200)       NULL,
    X DECIMAL(9,3) NOT NULL, Y DECIMAL(9,3) NOT NULL,
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT FK_Amenity_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT FK_Amenity_Level FOREIGN KEY (TenantId, LevelId) REFERENCES gabay.Level (TenantId, LevelId),
    CONSTRAINT FK_Amenity_Unit FOREIGN KEY (TenantId, UnitId) REFERENCES gabay.Unit (TenantId, UnitId)
);
CREATE INDEX IX_Amenity_Venue ON gabay.Amenity (TenantId, VenueId, AmenityTypeId);  -- serves: "nearest CR" target set at publish

CREATE TABLE gabay.TransitPoint (
    TransitPointId       INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_TransitPoint PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    LevelId              INT                NOT NULL,
    TransitTypeId        INT                NOT NULL CONSTRAINT FK_TransitPoint_Type REFERENCES gabay.TransitType (TransitTypeId),
    Name                 VARCHAR(200)       NOT NULL,
    X DECIMAL(9,3) NOT NULL, Y DECIMAL(9,3) NOT NULL,   -- inside the venue boundary, at its edge (L30)
    Note                 VARCHAR(200)       NULL,
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT FK_TransitPoint_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT FK_TransitPoint_Level FOREIGN KEY (TenantId, LevelId) REFERENCES gabay.Level (TenantId, LevelId)
);
CREATE INDEX IX_TransitPoint_Venue ON gabay.TransitPoint (TenantId, VenueId);  -- serves: directory and package build

CREATE TABLE gabay.Anchor (
    AnchorId             INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_Anchor PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    LevelId              INT                NOT NULL,
    UnitId               INT                NULL,
    Name                 VARCHAR(200)       NOT NULL,
    X DECIMAL(9,3) NOT NULL, Y DECIMAL(9,3) NOT NULL,
    -- 0.9: QrCode removed (L107: no QR in the product)
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT FK_Anchor_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT FK_Anchor_Level FOREIGN KEY (TenantId, LevelId) REFERENCES gabay.Level (TenantId, LevelId)
);
CREATE INDEX IX_Anchor_Level ON gabay.Anchor (TenantId, LevelId);  -- serves: editor floor load; the publish read (replaces UX_Anchor_QrCode, L107)

/* ---------------------------------------------------------------------
   4. Navigation: connectors (L37, L38) and graph corrections (L32).
      The walkway graph itself is generated at publish and lives only in the
      immutable package (D6 CSR blob); the database keeps inputs and fixes.
   --------------------------------------------------------------------- */
CREATE TABLE gabay.NavConnector (
    NavConnectorId       INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_NavConnector PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    ConnectorTypeId      INT                NOT NULL CONSTRAINT FK_NavConnector_Type REFERENCES gabay.ConnectorType (ConnectorTypeId),
    Name                 VARCHAR(200)       NOT NULL,
    FromLevelId          INT                NOT NULL,
    FromX DECIMAL(9,3) NOT NULL, FromY DECIMAL(9,3) NOT NULL,
    ToLevelId            INT                NULL,      -- NULL for elevators (stops in NavConnectorStop)
    ToX DECIMAL(9,3) NULL, ToY DECIMAL(9,3) NULL,
    IsBidirectional      BOOLEAN            NOT NULL,  -- L86: as the real mall is; a one-way escalator row is used only From -> To
    IsEvacuationOnly     BOOLEAN            NOT NULL DEFAULT FALSE,  -- L87: used only in an evacuation (e.g. stairs to basements)
    SpokenName           VARCHAR(200)       NULL,      -- L112: what the voice says; NULL = Name
    RiseM                DECIMAL(9,3)       NULL,      -- height (L39); feeds the L86 metre cost (CostPerRiseM x rise)
    -- 0.5: InclineDeg, SpeedMps, DoorCycleS and ExpectedWaitS removed; routes are by metres (L86, superseding L38).
    NeedsReview          BOOLEAN            NOT NULL DEFAULT FALSE,  -- L108: generated from an uploaded plan and not yet confirmed; publish refuses while any is TRUE
    DraftConfidence      DECIMAL(4,3)       NULL CONSTRAINT CK_NavConn_DraftConfidence CHECK (DraftConfidence BETWEEN 0 AND 1),  -- L108: the generator's confidence (low ones are highlighted); NULL = drawn by hand
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT FK_NavConnector_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT FK_NavConnector_From FOREIGN KEY (TenantId, FromLevelId) REFERENCES gabay.Level (TenantId, LevelId),
    CONSTRAINT FK_NavConnector_To FOREIGN KEY (TenantId, ToLevelId) REFERENCES gabay.Level (TenantId, LevelId),
    CONSTRAINT UQ_NavConnector_Tenant_Conn UNIQUE (TenantId, NavConnectorId)
);
CREATE INDEX IX_NavConnector_Venue ON gabay.NavConnector (TenantId, VenueId);  -- serves: package build, live-status targets
CREATE INDEX IX_NavConn_NeedsReview ON gabay.NavConnector (TenantId, VenueId) WHERE NeedsReview;  -- serves: publish's "anything unreviewed?" check; the editor's review list (L108)

CREATE TABLE gabay.NavConnectorStop (
    NavConnectorStopId   INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_NavConnectorStop PRIMARY KEY,
    TenantId             INT                NOT NULL,
    NavConnectorId       INT                NOT NULL,
    LevelId              INT                NOT NULL,
    X DECIMAL(9,3) NOT NULL, Y DECIMAL(9,3) NOT NULL,
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT FK_NavConnectorStop_Conn FOREIGN KEY (TenantId, NavConnectorId) REFERENCES gabay.NavConnector (TenantId, NavConnectorId),
    CONSTRAINT FK_NavConnectorStop_Level FOREIGN KEY (TenantId, LevelId) REFERENCES gabay.Level (TenantId, LevelId),
    CONSTRAINT UQ_NavConnectorStop UNIQUE (NavConnectorId, LevelId)   -- one stop per floor served
);

CREATE TABLE gabay.NavCorrection (
    NavCorrectionId      INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_NavCorrection PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    LevelId              INT                NOT NULL,
    CorrectionKind       VARCHAR(20)        NOT NULL CONSTRAINT CK_NavCorrection_Kind
                             CHECK (CorrectionKind IN ('BLOCK_AREA', 'ADD_PATH', 'REMOVE_PATH')),  -- L32; constants file; closed: each kind is a graph-generation operation in code
    GeometryGeoJson      JSONB              NOT NULL,
    Note                 VARCHAR(200)       NULL,
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT FK_NavCorrection_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT FK_NavCorrection_Level FOREIGN KEY (TenantId, LevelId) REFERENCES gabay.Level (TenantId, LevelId)
);
CREATE INDEX IX_NavCorrection_Level ON gabay.NavCorrection (TenantId, VenueId, LevelId);  -- serves: graph generation at publish

/* ---------------------------------------------------------------------
   5. Published versions (invariant 3, Frozen Package rule)
   --------------------------------------------------------------------- */
CREATE TABLE gabay.VenueVersion (
    VenueVersionId       INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_VenueVersion PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    VersionNo            INT                NOT NULL,
    Status               VARCHAR(12)        NOT NULL CONSTRAINT CK_VenueVersion_Status
                             CHECK (Status IN ('BUILDING', 'PUBLISHED', 'FAILED')),  -- constants file; closed: the publish state machine in code
    PackageFileId        BIGINT             NULL,      -- the tenant's own file (composite FK below); the object lives in Cloud Storage (L98)
    PackageSha256        CHAR(64)           NULL,
    PackageFormatVersion INT                NOT NULL,  -- §8.5 companion-file sync table
    NodeCount            INT                NULL,
    EdgeCount            INT                NULL,
    PublishedAt          TIMESTAMPTZ(3)     NULL,
    PublishedBy          INT                NULL,      -- must hold venue.publish (Venue Editor cannot, L41)
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT FK_VenueVersion_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT FK_VenueVersion_File FOREIGN KEY (TenantId, PackageFileId) REFERENCES gabay.StoredFile (TenantId, FileId),
    CONSTRAINT UQ_VenueVersion UNIQUE (TenantId, VenueId, VersionNo),  -- serves: next version number per venue
    CONSTRAINT UQ_VenueVersion_Tenant_Ver UNIQUE (TenantId, VenueVersionId),
    CONSTRAINT CK_VenueVersion_Published CHECK (Status <> 'PUBLISHED' OR (PackageFileId IS NOT NULL AND PackageSha256 IS NOT NULL AND PublishedAt IS NOT NULL))
);
CREATE INDEX IX_VenueVersion_Latest ON gabay.VenueVersion (TenantId, VenueId, Status, VersionNo DESC);  -- serves: public "latest published" + ETag

-- Frozen Package rule, database layer: a PUBLISHED row is never updated or deleted.
CREATE FUNCTION gabay.tr_venueversion_frozen() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.Status = 'PUBLISHED' THEN
        RAISE EXCEPTION 'Frozen Package: a published venue version is never updated or deleted.'
            USING ERRCODE = 'P0001';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER TR_VenueVersion_Frozen
    BEFORE UPDATE OR DELETE ON gabay.VenueVersion
    FOR EACH ROW EXECUTE FUNCTION gabay.tr_venueversion_frozen();

/* ---------------------------------------------------------------------
   6. Beacons, sentinels, planner (invariants 7-9; D9 ruled A by L114; L40)
   --------------------------------------------------------------------- */
CREATE TABLE gabay.BeaconPlan (
    BeaconPlanId         INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_BeaconPlan PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    LevelId              INT                NOT NULL,
    PlanKind             VARCHAR(20)        NOT NULL CONSTRAINT CK_BeaconPlan_Kind
                             CHECK (PlanKind IN ('MIN_PROXIMITY', 'RECOMMENDED', 'BUDGET_CAP')),  -- L40; constants file; closed: each kind is a planner algorithm in code
    Status               VARCHAR(12)        NOT NULL CONSTRAINT CK_BeaconPlan_Status
                             CHECK (Status IN ('PROPOSED', 'SELECTED', 'SUPERSEDED')),  -- L40; constants file; closed: the plan workflow in code
    BudgetCap            DECIMAL(18,4)      NULL,      -- money (standard rule 1)
    BeaconCount          INT                NOT NULL,
    EstimatedCost        DECIMAL(18,4)      NULL,
    P95Gdop              DECIMAL(9,3)       NULL,
    CoveragePct          DECIMAL(5,2)       NULL,
    InputsJson           JSONB              NOT NULL,  -- k values, RSSI params, prices; the L95 estimate's inputs
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT FK_BeaconPlan_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT FK_BeaconPlan_Level FOREIGN KEY (TenantId, LevelId) REFERENCES gabay.Level (TenantId, LevelId),
    CONSTRAINT UQ_BeaconPlan_Tenant_Plan UNIQUE (TenantId, BeaconPlanId)
);
CREATE INDEX IX_BeaconPlan_Level ON gabay.BeaconPlan (TenantId, VenueId, LevelId, Status);  -- serves: the planner's plan list per floor

CREATE TABLE gabay.BeaconPlanItem (
    BeaconPlanItemId     INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_BeaconPlanItem PRIMARY KEY,
    TenantId             INT                NOT NULL,
    BeaconPlanId         INT                NOT NULL,
    X DECIMAL(9,3) NOT NULL, Y DECIMAL(9,3) NOT NULL,
    MountHeightM         DECIMAL(5,2)       NOT NULL,  -- L45: the highest point available; on the ceiling where it is below 3 m
    PlacementReason      VARCHAR(20)        NOT NULL CONSTRAINT CK_BeaconPlanItem_Reason
                             CHECK (PlacementReason IN ('CONNECTOR', 'ENTRANCE', 'COVERAGE', 'GEOMETRY')),  -- L40; constants file; closed: written by the planner algorithm, not by people
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    -- No VenueId: always loaded through its BeaconPlan, which carries it (Blueprint invariant 13, child-row note).
    CONSTRAINT FK_BeaconPlanItem_Plan FOREIGN KEY (TenantId, BeaconPlanId) REFERENCES gabay.BeaconPlan (TenantId, BeaconPlanId),
    CONSTRAINT UQ_BeaconPlanItem_Tenant_Item UNIQUE (TenantId, BeaconPlanItemId)  -- composite-FK target for Beacon
);
CREATE INDEX IX_BeaconPlanItem_Plan ON gabay.BeaconPlanItem (TenantId, BeaconPlanId);  -- serves: plan load with its items

CREATE TABLE gabay.Beacon (
    BeaconId             BIGINT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_Beacon PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    LevelId              INT                NOT NULL,
    X DECIMAL(9,3) NOT NULL, Y DECIMAL(9,3) NOT NULL,
    MountHeightM         DECIMAL(5,2)       NULL,
    ProximityUuid        UUID               NOT NULL,
    Major                INT                NOT NULL CONSTRAINT CK_Beacon_Major CHECK (Major BETWEEN 0 AND 65535),
    Minor                INT                NOT NULL CONSTRAINT CK_Beacon_Minor CHECK (Minor BETWEEN 0 AND 65535),
    IdentityScheme       VARCHAR(20)        NOT NULL CONSTRAINT CK_Beacon_Scheme
                             CHECK (IdentityScheme IN ('IBEACON_STATIC')),  -- D9 ruled A by L114: static iBeacon, a range per level (L96); constants file; closed: each scheme is decoding code; widen by migration
    MeasuredPower        SMALLINT           NULL,
    BeaconModelId        INT                NULL CONSTRAINT FK_Beacon_Model REFERENCES gabay.BeaconModel (BeaconModelId),  -- lookup: single-column by design (header)
    BeaconPlanItemId     INT                NULL,      -- composite FK below
    InstalledOn          DATE               NULL,
    BatteryServicedOn    DATE               NULL,
    IsActive             BOOLEAN            NOT NULL DEFAULT TRUE,
    -- Deliberately excluded: key material (keyed schemes get a separate encrypted table) and
    -- any per-shopper sighting (invariant 4).
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT FK_Beacon_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT FK_Beacon_Level FOREIGN KEY (TenantId, LevelId) REFERENCES gabay.Level (TenantId, LevelId),
    CONSTRAINT FK_Beacon_Namespace FOREIGN KEY (TenantId, ProximityUuid) REFERENCES gabay.Tenant (TenantId, BeaconProximityUuid),
    CONSTRAINT FK_Beacon_PlanItem FOREIGN KEY (TenantId, BeaconPlanItemId) REFERENCES gabay.BeaconPlanItem (TenantId, BeaconPlanItemId),
    CONSTRAINT UQ_Beacon_Identity UNIQUE (ProximityUuid, Major, Minor),  -- serves: publish-time collision check (invariant 9)
    CONSTRAINT UQ_Beacon_Tenant_Beacon UNIQUE (TenantId, BeaconId)       -- composite-FK target for the sentinel readings
);
CREATE INDEX IX_Beacon_Level ON gabay.Beacon (TenantId, VenueId, LevelId, IsActive);  -- serves: editor load, package build

CREATE TABLE gabay.Sentinel (
    SentinelId           INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_Sentinel PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    LevelId              INT                NOT NULL,
    Name                 VARCHAR(100)       NOT NULL,
    X DECIMAL(9,3) NOT NULL, Y DECIMAL(9,3) NOT NULL,
    HmacSecretEnc        BYTEA              NOT NULL,  -- ENCRYPTED AT REST (application-level, key outside the database); §3.17 ingest
    IsActive             BOOLEAN            NOT NULL DEFAULT TRUE,
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT FK_Sentinel_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT FK_Sentinel_Level FOREIGN KEY (TenantId, LevelId) REFERENCES gabay.Level (TenantId, LevelId),
    CONSTRAINT UQ_Sentinel_Tenant_Sentinel UNIQUE (TenantId, SentinelId)
);
CREATE INDEX IX_Sentinel_Venue ON gabay.Sentinel (TenantId, VenueId, IsActive);  -- serves: beacon-health view per venue

-- High volume (~5.3M rows / venue / year at 20 sentinels x 30 beacons). Not audit-stamped per row (§3.6 noise filter).
-- Retention: hourly rows 90 days, then rolled into SentinelReadingDaily (25 months).
CREATE TABLE gabay.SentinelReadingHourly (
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,  -- 0.2: invariant 13; health queries run by venue and time
    SentinelId           INT                NOT NULL,
    BeaconId             BIGINT             NOT NULL,
    HourStart            TIMESTAMPTZ(0)     NOT NULL,
    MedianRssi           SMALLINT           NOT NULL,
    SampleCount          INT                NOT NULL,
    CONSTRAINT PK_SentinelReadingHourly PRIMARY KEY (SentinelId, BeaconId, HourStart),  -- serves: ingest upsert per sentinel, beacon and hour
    CONSTRAINT FK_SRH_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT FK_SRH_Sentinel FOREIGN KEY (TenantId, SentinelId) REFERENCES gabay.Sentinel (TenantId, SentinelId),
    CONSTRAINT FK_SRH_Beacon FOREIGN KEY (TenantId, BeaconId) REFERENCES gabay.Beacon (TenantId, BeaconId)
);
CREATE INDEX IX_SRH_Venue ON gabay.SentinelReadingHourly (TenantId, VenueId, HourStart);  -- serves: beacon-health trend by venue; the 90-day roll-up

CREATE TABLE gabay.SentinelReadingDaily (
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,  -- 0.2: invariant 13
    SentinelId           INT                NOT NULL,
    BeaconId             BIGINT             NOT NULL,
    DayStart             DATE               NOT NULL,
    MedianRssi           SMALLINT           NOT NULL,
    SampleCount          INT                NOT NULL,
    CONSTRAINT PK_SentinelReadingDaily PRIMARY KEY (SentinelId, BeaconId, DayStart),  -- serves: roll-up upsert
    CONSTRAINT FK_SRD_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT FK_SRD_Sentinel FOREIGN KEY (TenantId, SentinelId) REFERENCES gabay.Sentinel (TenantId, SentinelId),
    CONSTRAINT FK_SRD_Beacon FOREIGN KEY (TenantId, BeaconId) REFERENCES gabay.Beacon (TenantId, BeaconId)
);
CREATE INDEX IX_SRD_Venue ON gabay.SentinelReadingDaily (TenantId, VenueId, DayStart);  -- serves: 25-month beacon-health trend by venue

/* ---------------------------------------------------------------------
   7. Live venue status overlay (L28, P1) — separate from the frozen package
   --------------------------------------------------------------------- */
CREATE TABLE gabay.Closure (
    ClosureId            INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_Closure PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    LevelId              INT                NULL,
    NavConnectorId       INT                NULL,      -- out-of-service escalator/lift
    AreaGeoJson          JSONB              NULL,
    Reason               VARCHAR(200)       NOT NULL,
    StartsAt             TIMESTAMPTZ(3)     NOT NULL,
    EndsAt               TIMESTAMPTZ(3)     NULL,
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT FK_Closure_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT FK_Closure_Level FOREIGN KEY (TenantId, LevelId) REFERENCES gabay.Level (TenantId, LevelId),
    CONSTRAINT FK_Closure_Conn FOREIGN KEY (TenantId, NavConnectorId) REFERENCES gabay.NavConnector (TenantId, NavConnectorId),
    CONSTRAINT CK_Closure_Target CHECK (NavConnectorId IS NOT NULL OR AreaGeoJson IS NOT NULL)
);
CREATE INDEX IX_Closure_Active ON gabay.Closure (TenantId, VenueId, EndsAt);  -- serves: public live-status read

/* ---------------------------------------------------------------------
   8. Shoppers and consented analytics (D1; L42 legal gate; L98 Firebase Auth)
   --------------------------------------------------------------------- */
CREATE TABLE gabay.ShopperAccount (
    ShopperAccountId     INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_ShopperAccount PRIMARY KEY,
    -- Platform-scoped on purpose: one shopper uses many malls (tenants). Separate from AppUser (D1).
    FirebaseUid          VARCHAR(128)       NOT NULL,  -- the Firebase Auth UID (E-08); credentials live in Firebase Auth
    Email                VARCHAR(254)       NULL,      -- copy from the Firebase user, for display and the deletion path
    EmailVerifiedAt      TIMESTAMPTZ(3)     NULL,
    AuthProvider         VARCHAR(20)        NULL,      -- the Firebase provider id (password, google.com, apple.com); D1b picks which are offered
    DisplayName          VARCHAR(120)       NULL,
    DeletionRequestedAt  TIMESTAMPTZ(3)     NULL,      -- Apple / Google Play deletion paths; the Firebase user is deleted with the row
    -- 0.7: PasswordHash and ProviderSubject removed (L98); the UID replaces both.
    -- Deliberately excluded: any position, route, or saved parking spot (kept on device; invariant 4, L30).
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT UQ_ShopperAccount_FirebaseUid UNIQUE (FirebaseUid)  -- serves: the UID -> account lookup on every signed-in request
);
CREATE UNIQUE INDEX UX_ShopperAccount_Email ON gabay.ShopperAccount (Email) WHERE Email IS NOT NULL;  -- serves: one account per email; the deletion lookup

CREATE TABLE gabay.AnalyticsConsent (
    AnalyticsConsentId   BIGINT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_AnalyticsConsent PRIMARY KEY,
    PseudonymId          UUID               NOT NULL,  -- device-generated; rotated on withdrawal
    ConsentTextVersion   VARCHAR(20)        NOT NULL,  -- which just-in-time notice was shown (NPC 2023-04)
    GrantedAt            TIMESTAMPTZ(3)     NOT NULL,
    WithdrawnAt          TIMESTAMPTZ(3)     NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    CONSTRAINT UQ_AnalyticsConsent_Pseudonym UNIQUE (PseudonymId)  -- serves: consent check on each trace write; FK target
);

-- L42: NO WRITES until the legal gate (DPO, counsel, NPC registration check) clears.
-- Retention (proposal for DPO): 13 months, then deleted. Not audit-stamped per row.
-- 0.8 (L104): one row per visit session of an opted-in shopper: the displayed dot while it shows, at most
-- 1 Hz (analytics.dotIntervalMs), not only during routes. Routes, lookups and arrivals are AnalyticsEvent rows.
CREATE TABLE gabay.RouteTrace (
    RouteTraceId         BIGINT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_RouteTrace PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    VenueVersionId       INT                NOT NULL,
    PseudonymId          UUID               NOT NULL CONSTRAINT FK_RouteTrace_Consent REFERENCES gabay.AnalyticsConsent (PseudonymId),
    SessionId            UUID               NOT NULL,  -- 0.8: device-generated per visit session; joins AnalyticsEvent
    StartedAt            TIMESTAMPTZ(0)     NOT NULL,
    EndedAt              TIMESTAMPTZ(0)     NULL,
    TracePoints          JSONB              NOT NULL,  -- 0.8: [[secondsFromStart, x, y, levelId, edgeKey, roomUnitId|null], ...]
    PointCount           INT                NOT NULL,
    CONSTRAINT UQ_RouteTrace_Session UNIQUE (PseudonymId, SessionId),  -- serves: an idempotent upload retry
    CONSTRAINT FK_RouteTrace_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT FK_RouteTrace_Version FOREIGN KEY (TenantId, VenueVersionId) REFERENCES gabay.VenueVersion (TenantId, VenueVersionId)
);
CREATE INDEX IX_RouteTrace_Venue ON gabay.RouteTrace (TenantId, VenueId, StartedAt);  -- serves: the nightly roll-up of one venue's day

/* ---------------------------------------------------------------------
   8b. Visit analytics (L104) and forecasts (L105)
   Every table fed by shoppers' data (AnalyticsEvent, the AnalyticsDaily* roll-up, and the app-visit
   rows of Forecast) is under the same L42 gate: NO WRITES until it clears. Days are the venue's local
   calendar day (Asia/Manila). The roll-up tables are machine-written once a night, so they carry
   ComputedAt instead of the four audit columns. Their Shoppers column (distinct pseudonyms) lets the
   API withhold any row built from fewer than analytics.minGroupN shoppers (L104; N is set by the DPO).
   --------------------------------------------------------------------- */
-- Retention (proposal for DPO): 13 months, as RouteTrace.
CREATE TABLE gabay.AnalyticsEvent (
    AnalyticsEventId     BIGINT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_AnalyticsEvent PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    VenueVersionId       INT                NOT NULL,
    PseudonymId          UUID               NOT NULL CONSTRAINT FK_AnalyticsEvent_Consent REFERENCES gabay.AnalyticsConsent (PseudonymId),
    SessionId            UUID               NOT NULL,  -- joins the session's RouteTrace row
    EventKind            VARCHAR(20)        NOT NULL CONSTRAINT CK_AnalyticsEvent_Kind
                             CHECK (EventKind IN ('LOOKUP_OPEN', 'LOOKUP_END', 'ROUTE_START', 'ROUTE_REROUTE', 'ROUTE_END', 'ARRIVE')),  -- L104 (the spike's L71 lines); constants file; closed: each kind is written by one app code path and read by the roll-up
    OccurredAt           TIMESTAMPTZ(0)     NOT NULL,
    UnitId               INT                NULL,      -- the place looked up, routed to or arrived at
    RefId                UUID               NULL,      -- joins a lookup to the route it started, and a route to its arrival
    Detail               JSONB              NULL,      -- e.g. {"result":"GO"}, {"reason":"OFF_ROUTE"}, {"mode":"DETECTED","answer":"CONFIRMED","toArriveS":212}
    CONSTRAINT FK_AnalyticsEvent_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT FK_AnalyticsEvent_Version FOREIGN KEY (TenantId, VenueVersionId) REFERENCES gabay.VenueVersion (TenantId, VenueVersionId),
    CONSTRAINT FK_AnalyticsEvent_Unit FOREIGN KEY (TenantId, UnitId) REFERENCES gabay.Unit (TenantId, UnitId)
);
CREATE INDEX IX_AnalyticsEvent_Venue ON gabay.AnalyticsEvent (TenantId, VenueId, OccurredAt);  -- serves: the nightly roll-up of one venue's day

-- Histograms (ArriveTimeHist, StayHist) use the bin edges in the shared constants file, so a median or
-- p95 over any date range is read from summed bins (exact to the bin) instead of averaging daily medians.
CREATE TABLE gabay.AnalyticsDailyVenue (
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    VenueVersionId       INT                NOT NULL,
    Day                  DATE               NOT NULL,
    Shoppers             INT                NOT NULL,  -- distinct pseudonyms that day
    MallVisits           INT                NOT NULL,  -- sessions with at least one dot
    VisitsByHour         INT[]              NOT NULL,  -- 24 counts, by the session's start hour
    RoutesStarted        INT                NOT NULL,
    RoutesOffRoute       INT                NOT NULL,  -- routes with at least one off-route reroute (L80)
    LookupsOpened        INT                NOT NULL,  -- the funnel: card opened, route started, arrived, said yes
    LookupsToRoute       INT                NOT NULL,
    LookupsArrived       INT                NOT NULL,
    LookupsConfirmed     INT                NOT NULL,  -- only trips whose position was unsure ask (L99)
    ArriveTimeHist       INT[]              NOT NULL,
    ComputedAt           TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    CONSTRAINT PK_AnalyticsDailyVenue PRIMARY KEY (TenantId, VenueId, VenueVersionId, Day),  -- serves: the dashboard's range read, by map version or all
    CONSTRAINT FK_ADV_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT FK_ADV_Version FOREIGN KEY (TenantId, VenueVersionId) REFERENCES gabay.VenueVersion (TenantId, VenueVersionId),
    CONSTRAINT CK_ADV_Hours CHECK (cardinality(VisitsByHour) = 24)
);

CREATE TABLE gabay.AnalyticsDailyUnit (
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    VenueVersionId       INT                NOT NULL,
    Day                  DATE               NOT NULL,
    UnitId               INT                NOT NULL,  -- a store or a facility with a room or a door zone
    Shoppers             INT                NOT NULL,
    Visits               INT                NOT NULL,  -- analytics.minStayS inside; gaps under analytics.visitMergeGapS merge
    VisitsByHour         INT[]              NOT NULL,  -- 24 counts; also feeds the status-impact windows
    Arrivals             INT                NOT NULL,
    ArrivalsByHour       INT[]              NOT NULL,
    LookupsOpened        INT                NOT NULL,
    LookupsToRoute       INT                NOT NULL,
    LookupsArrived       INT                NOT NULL,
    LookupsConfirmed     INT                NOT NULL,
    StaysMeasured        INT                NOT NULL,  -- visits whose exit was seen
    ClosedInside         INT                NOT NULL,  -- visits cut off by the app closing: counted, stay dropped
    StayHist             INT[]              NOT NULL,
    IsEstimated          BOOLEAN            NOT NULL,  -- counted from a door zone, not a room outline
    ComputedAt           TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    CONSTRAINT PK_AnalyticsDailyUnit PRIMARY KEY (TenantId, VenueId, VenueVersionId, Day, UnitId),  -- serves: the store list for a range
    CONSTRAINT FK_ADU_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT FK_ADU_Version FOREIGN KEY (TenantId, VenueVersionId) REFERENCES gabay.VenueVersion (TenantId, VenueVersionId),
    CONSTRAINT FK_ADU_Unit FOREIGN KEY (TenantId, UnitId) REFERENCES gabay.Unit (TenantId, UnitId),
    CONSTRAINT CK_ADU_Hours CHECK (cardinality(VisitsByHour) = 24 AND cardinality(ArrivalsByHour) = 24)
);
CREATE INDEX IX_ADU_Unit ON gabay.AnalyticsDailyUnit (TenantId, UnitId, Day);  -- serves: one store's page (trend, stay, funnel, status impact); later the merchant's page

-- The heat map: dot seconds per analytics.heatCellM cell. DestinationUnitId NULL = every dot; a value =
-- only the dots on a route to that place (the dashboard's destination filter).
CREATE TABLE gabay.AnalyticsDailyCell (
    AnalyticsDailyCellId BIGINT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_AnalyticsDailyCell PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    VenueVersionId       INT                NOT NULL,
    Day                  DATE               NOT NULL,
    LevelId              INT                NOT NULL,
    DestinationUnitId    INT                NULL,
    CellX                INT                NOT NULL,
    CellY                INT                NOT NULL,
    Samples              INT                NOT NULL,
    Shoppers             INT                NOT NULL,
    ComputedAt           TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    CONSTRAINT FK_ADC_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT FK_ADC_Version FOREIGN KEY (TenantId, VenueVersionId) REFERENCES gabay.VenueVersion (TenantId, VenueVersionId),
    CONSTRAINT FK_ADC_Level FOREIGN KEY (TenantId, LevelId) REFERENCES gabay.Level (TenantId, LevelId),
    CONSTRAINT FK_ADC_Destination FOREIGN KEY (TenantId, DestinationUnitId) REFERENCES gabay.Unit (TenantId, UnitId)
);
CREATE UNIQUE INDEX UX_ADC_All ON gabay.AnalyticsDailyCell (TenantId, VenueId, VenueVersionId, LevelId, Day, CellX, CellY) WHERE DestinationUnitId IS NULL;  -- serves: the heat map of one floor for a range; the roll-up upsert
CREATE UNIQUE INDEX UX_ADC_Dest ON gabay.AnalyticsDailyCell (TenantId, VenueId, VenueVersionId, LevelId, DestinationUnitId, Day, CellX, CellY) WHERE DestinationUnitId IS NOT NULL;  -- serves: the heat map filtered by destination

CREATE TABLE gabay.AnalyticsDailyEdge (
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    VenueVersionId       INT                NOT NULL,  -- an edge key is stable only within its package version
    Day                  DATE               NOT NULL,
    EdgeKey              VARCHAR(40)        NOT NULL,
    Samples              INT                NOT NULL,
    Shoppers             INT                NOT NULL,
    ComputedAt           TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    CONSTRAINT PK_AnalyticsDailyEdge PRIMARY KEY (TenantId, VenueId, VenueVersionId, Day, EdgeKey),  -- serves: the busiest walkways for a range
    CONSTRAINT FK_ADE_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT FK_ADE_Version FOREIGN KEY (TenantId, VenueVersionId) REFERENCES gabay.VenueVersion (TenantId, VenueVersionId)
);

-- Not shopper data, so not under the L42 gate: written in the same transaction as the Occupant status
-- update (the overlay, L102). Insert-only, CreatedBy only. The status-impact figures read it.
CREATE TABLE gabay.StoreStatusChange (
    StoreStatusChangeId  BIGINT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_StoreStatusChange PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    OccupantId           INT                NOT NULL,
    UnitId               INT                NOT NULL,  -- the Occupant's unit at the time
    FromStoreStatusId    INT                NULL CONSTRAINT FK_SSC_From REFERENCES gabay.StoreStatus (StoreStatusId),  -- lookup: single-column by design (header)
    ToStoreStatusId      INT                NOT NULL CONSTRAINT FK_SSC_To REFERENCES gabay.StoreStatus (StoreStatusId),
    ChangedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    CreatedBy            INT                NULL,
    CONSTRAINT FK_SSC_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT FK_SSC_Occupant FOREIGN KEY (TenantId, OccupantId) REFERENCES gabay.Occupant (TenantId, OccupantId),
    CONSTRAINT FK_SSC_Unit FOREIGN KEY (TenantId, UnitId) REFERENCES gabay.Unit (TenantId, UnitId)
);
CREATE INDEX IX_SSC_Unit ON gabay.StoreStatusChange (TenantId, UnitId, ChangedAt);  -- serves: status impact per store

-- L105: TenantId NULL and VenueId NULL = a national holiday, kept by Gabay staff each year from the
-- proclamations; a tenant or venue value = a local holiday the mall adds. A table, not a list (rule 5).
CREATE TABLE gabay.Holiday (
    HolidayId            INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_Holiday PRIMARY KEY,
    TenantId             INT                NULL CONSTRAINT FK_Holiday_Tenant REFERENCES gabay.Tenant (TenantId),
    VenueId              INT                NULL,
    HolidayDate          DATE               NOT NULL,
    Name                 VARCHAR(120)       NOT NULL,
    HolidayKind          VARCHAR(20)        NOT NULL CONSTRAINT CK_Holiday_Kind
                             CHECK (HolidayKind IN ('REGULAR', 'SPECIAL_NON_WORKING', 'SPECIAL_WORKING', 'LOCAL')),  -- L105; the proclamations' categories plus a mall's local day (RECALLED; check against the next proclamation at P1); constants file; closed: each kind is a separate forecast signal in code
    ProclamationRef      VARCHAR(80)        NULL,
    IsActive             BOOLEAN            NOT NULL DEFAULT TRUE,
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT FK_Holiday_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT CK_Holiday_Scope CHECK (VenueId IS NULL OR TenantId IS NOT NULL)
);
CREATE UNIQUE INDEX UX_Holiday ON gabay.Holiday (COALESCE(TenantId, 0), COALESCE(VenueId, 0), HolidayDate, Name);  -- serves: one row per holiday per scope; the forecast's calendar read by date

CREATE TABLE gabay.MallEvent (
    MallEventId          INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_MallEvent PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    Name                 VARCHAR(160)       NOT NULL,  -- a sale, concert or launch the mall admin enters (L105)
    StartsOn             DATE               NOT NULL,
    EndsOn               DATE               NOT NULL,
    IsActive             BOOLEAN            NOT NULL DEFAULT TRUE,
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT FK_MallEvent_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT CK_MallEvent_Dates CHECK (EndsOn >= StartsOn)
);
CREATE INDEX IX_MallEvent_Venue ON gabay.MallEvent (TenantId, VenueId, StartsOn);  -- serves: events inside the forecast window; the event list screen

-- L105: the mall's own door-counter totals, uploaded as CSV. Not shopper data, so not under the L42 gate.
-- The CSV columns are OPEN (Blueprint OQ18); these columns are the minimum any counter export gives.
CREATE TABLE gabay.FootfallCount (
    FootfallCountId      BIGINT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_FootfallCount PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    CountDate            DATE               NOT NULL,
    CountHour            SMALLINT           NULL CONSTRAINT CK_FootfallCount_Hour CHECK (CountHour BETWEEN 0 AND 23),  -- NULL = a whole-day total
    EntranceName         VARCHAR(80)        NULL,      -- as the counter names it; NULL = the whole mall
    Visitors             INT                NOT NULL CONSTRAINT CK_FootfallCount_Visitors CHECK (Visitors >= 0),
    SourceFileId         BIGINT             NOT NULL,  -- the uploaded CSV (StoredFile purpose FOOTFALL_CSV)
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    UpdatedBy            INT                NULL,
    UpdatedAt            TIMESTAMPTZ(3)     NULL,
    CONSTRAINT FK_FootfallCount_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT FK_FootfallCount_File FOREIGN KEY (TenantId, SourceFileId) REFERENCES gabay.StoredFile (TenantId, FileId)
);
CREATE UNIQUE INDEX UX_FootfallCount ON gabay.FootfallCount (TenantId, VenueId, CountDate, COALESCE(CountHour, -1), COALESCE(EntranceName, ''));  -- serves: a re-upload replaces the same day; the forecast's daily read

-- L105: the nightly forecast, replaced in place (upsert). Counts are DECIMAL because an expected
-- count is fractional; no float anywhere (rule 1's no-float wording).
CREATE TABLE gabay.Forecast (
    ForecastId           BIGINT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_Forecast PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    UnitId               INT                NULL,      -- a store's weekly visits; NULL for venue-wide figures
    Metric               VARCHAR(20)        NOT NULL CONSTRAINT CK_Forecast_Metric
                             CHECK (Metric IN ('VISITS_DAY', 'VISITS_HOUR', 'UNIT_VISITS_WEEK', 'FOOTFALL_DAY')),  -- L105; constants file; closed: each metric has its own model code and chart
    PeriodStart          TIMESTAMPTZ(0)     NOT NULL,  -- the hour, the day, or the ISO week's Monday, in venue local time
    Expected             DECIMAL(12,2)      NOT NULL,
    RangeLow             DECIMAL(12,2)      NOT NULL,
    RangeHigh            DECIMAL(12,2)      NOT NULL,
    BacktestErrorPct     DECIMAL(6,2)       NULL,      -- the error of this metric's past forecasts against what happened; NULL until measurable
    IsShown              BOOLEAN            NOT NULL,  -- passed the reliability gate: forecast.minHistoryDays and forecast.maxErrorPct
    ModelVersion         VARCHAR(20)        NOT NULL,
    GeneratedAt          TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    CONSTRAINT FK_Forecast_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES gabay.Venue (TenantId, VenueId),
    CONSTRAINT FK_Forecast_Unit FOREIGN KEY (TenantId, UnitId) REFERENCES gabay.Unit (TenantId, UnitId),
    CONSTRAINT CK_Forecast_Range CHECK (RangeLow <= Expected AND Expected <= RangeHigh)
);
CREATE UNIQUE INDEX UX_Forecast_Venue ON gabay.Forecast (TenantId, VenueId, Metric, PeriodStart) WHERE UnitId IS NULL;  -- serves: the nightly upsert; the dashboard's venue-wide forecast read
CREATE UNIQUE INDEX UX_Forecast_Unit ON gabay.Forecast (TenantId, VenueId, UnitId, Metric, PeriodStart) WHERE UnitId IS NOT NULL;  -- serves: a store's forecast (admin page; later the merchant page)

/* ---------------------------------------------------------------------
   9. Audit trail (standard §3.6) and app versions (§4.8)
   --------------------------------------------------------------------- */
-- Retention (proposal): 24 months online, then archived. About 4 KB per mutating request.
-- Row shape per standard §3.6: UserId, IPAddress, Route, Method, PayloadDiff. Written on res.on('finish'),
-- secrets redacted (redactSecrets) before serialisation, fire-and-forget.
CREATE TABLE gabay.AuditLog (
    AuditLogId           BIGINT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_AuditLog PRIMARY KEY,
    TenantId             INT                NULL,
    UserId               INT                NULL,      -- set once the Firebase ID token is verified and mapped (L98)
    ActingAsTenantId     INT                NULL,      -- SuperAdmin "act as mall admin" (L41), always recorded
    IPAddress            VARCHAR(45)        NULL,      -- ::ffff: normalised; 45 = longest IPv6 text form
    Method               VARCHAR(10)        NOT NULL,
    Route                VARCHAR(400)       NOT NULL,  -- capped to the column width
    EntityName           VARCHAR(80)        NULL,
    EntityId             VARCHAR(40)        NULL,
    PayloadDiff          VARCHAR(4000)      NULL,      -- {body,query,params,status}, capped about 4 KB with a truncation marker (so not always valid JSON; hence not JSONB)
    StatusCode           SMALLINT           NOT NULL,
    RequestId            VARCHAR(40)        NOT NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now()
);
CREATE INDEX IX_AuditLog_Tenant ON gabay.AuditLog (TenantId, CreatedAt DESC);  -- serves: audit viewer, newest first

CREATE TABLE gabay.AppVersion (
    AppVersionId         INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_AppVersion PRIMARY KEY,
    Surface              VARCHAR(10)        NOT NULL CONSTRAINT CK_AppVersion_Surface CHECK (Surface IN ('MOBILE', 'WEB')),  -- constants file; closed: the two release streams in the build pipeline
    Version              VARCHAR(20)        NOT NULL,
    ReleasedAt           TIMESTAMPTZ(3)     NOT NULL,
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now(),
    CONSTRAINT UQ_AppVersion UNIQUE (Surface, Version)  -- serves: version check per surface; one row per release
);

CREATE TABLE gabay.ChangelogEntry (
    ChangelogEntryId     INT GENERATED ALWAYS AS IDENTITY CONSTRAINT PK_ChangelogEntry PRIMARY KEY,
    AppVersionId         INT                NOT NULL CONSTRAINT FK_ChangelogEntry_Version REFERENCES gabay.AppVersion (AppVersionId),
    SortOrder            INT                NOT NULL,
    Text                 VARCHAR(400)       NOT NULL,
    CreatedBy            INT                NULL,
    CreatedAt            TIMESTAMPTZ(3)     NOT NULL DEFAULT now()
);
CREATE INDEX IX_ChangelogEntry_Version ON gabay.ChangelogEntry (AppVersionId, SortOrder);  -- serves: "what's new" for one release
