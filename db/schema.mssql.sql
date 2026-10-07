/* =====================================================================
   Gabay — db/schema.mssql.sql  (SUPERSEDED, kept as history)
   This is the T-SQL schema as it stood at DRAFT 0.6. On 2026-10-06 (plan L98,
   EXCEPTIONS E-06) the database became Cloud SQL for PostgreSQL through Firebase
   SQL Connect, and db/schema.sql is now the PostgreSQL version. Nothing here is
   deployed; it is the fallback if the lead declines E-06.
   DRAFT 0.6 · 2026-10-02 · for the P0 gate review
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
   other than its author". Reviewer: Allan Young, or Raphael Mendoza.)

   Source of truth for intent: GABAY_MASTER_BLUEPRINT.md Part 3.
   Re-runnable: every CREATE TABLE has a matching DROP TABLE. The drops run
   in reverse dependency order, the creates in dependency order.

   Conventions (Blueprint Part 3):
   - Tables singular PascalCase; columns PascalCase; FKs <Table>Id.
   - Money DECIMAL(18,4). Metres DECIMAL(9,3). No FLOAT or REAL anywhere.
   - Timestamps DATETIME2(3) in UTC (useUTC = true, standard §3.9/§3.10).
     Defaults use SYSUTCDATETIME().
   - Tenant-scoped tables carry TenantId. Child tables reference parents by
     composite (TenantId, <Parent>Id) FKs, so a cross-tenant link is refused
     by the database, not only by the predicate lint (invariant 13 / Two-Predicate).
   - Exception, by design: FKs to a lookup table, to AppUser and to a StoredFile
     that may be platform-owned are single-column. Their TenantId may be NULL
     (a platform-wide row), and a composite FK cannot express "the same tenant
     or the platform". DESIGN CHOICE: the lookup service (§3.19) and the write
     services check "same tenant or platform" on every write. The alternative is
     an INSTEAD OF trigger per referencing table, more SQL to maintain for the
     same rule.
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

SET NOCOUNT ON;
GO

/* ---------------------------------------------------------------------
   Dynamic FK-drop preamble (standard §8.2): drop every foreign key in dbo
   first, so the script re-runs whatever state an earlier run or a migration
   left. Gabay owns the dbo schema of its database.
   --------------------------------------------------------------------- */
DECLARE @dropFks NVARCHAR(MAX) = N'';
SELECT @dropFks += N'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(fk.parent_object_id)) + N'.'
       + QUOTENAME(OBJECT_NAME(fk.parent_object_id)) + N' DROP CONSTRAINT ' + QUOTENAME(fk.name) + N';' + NCHAR(10)
FROM sys.foreign_keys AS fk
WHERE OBJECT_SCHEMA_NAME(fk.parent_object_id) = N'dbo';
EXEC sys.sp_executesql @dropFks;
GO

/* ---------------------------------------------------------------------
   Temporal teardown (standard §8.2). No Gabay table is system-versioned
   today (Blueprint Part 3, temporal policy). This turns versioning off for
   any that a later migration adds, so the drops below never fail.
   --------------------------------------------------------------------- */
DECLARE @offTemporal NVARCHAR(MAX) = N'';
SELECT @offTemporal += N'ALTER TABLE ' + QUOTENAME(SCHEMA_NAME(t.schema_id)) + N'.' + QUOTENAME(t.name)
       + N' SET (SYSTEM_VERSIONING = OFF);' + NCHAR(10)
FROM sys.tables AS t
WHERE t.temporal_type = 2 AND SCHEMA_NAME(t.schema_id) = N'dbo';
EXEC sys.sp_executesql @offTemporal;
GO

/* ---------------------------------------------------------------------
   DROP (reverse dependency order)
   --------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.ChangelogEntry', N'U')        IS NOT NULL DROP TABLE dbo.ChangelogEntry;
IF OBJECT_ID(N'dbo.AppVersion', N'U')            IS NOT NULL DROP TABLE dbo.AppVersion;
IF OBJECT_ID(N'dbo.AuditLog', N'U')              IS NOT NULL DROP TABLE dbo.AuditLog;
IF OBJECT_ID(N'dbo.RouteTrace', N'U')            IS NOT NULL DROP TABLE dbo.RouteTrace;
IF OBJECT_ID(N'dbo.AnalyticsConsent', N'U')      IS NOT NULL DROP TABLE dbo.AnalyticsConsent;
IF OBJECT_ID(N'dbo.ShopperAccount', N'U')        IS NOT NULL DROP TABLE dbo.ShopperAccount;
IF OBJECT_ID(N'dbo.Closure', N'U')               IS NOT NULL DROP TABLE dbo.Closure;
IF OBJECT_ID(N'dbo.SentinelReadingDaily', N'U')  IS NOT NULL DROP TABLE dbo.SentinelReadingDaily;
IF OBJECT_ID(N'dbo.SentinelReadingHourly', N'U') IS NOT NULL DROP TABLE dbo.SentinelReadingHourly;
IF OBJECT_ID(N'dbo.Sentinel', N'U')              IS NOT NULL DROP TABLE dbo.Sentinel;
IF OBJECT_ID(N'dbo.Beacon', N'U')                IS NOT NULL DROP TABLE dbo.Beacon;
IF OBJECT_ID(N'dbo.BeaconPlanItem', N'U')        IS NOT NULL DROP TABLE dbo.BeaconPlanItem;
IF OBJECT_ID(N'dbo.BeaconPlan', N'U')            IS NOT NULL DROP TABLE dbo.BeaconPlan;
IF OBJECT_ID(N'dbo.VenueVersion', N'U')          IS NOT NULL DROP TABLE dbo.VenueVersion;
IF OBJECT_ID(N'dbo.NavCorrection', N'U')         IS NOT NULL DROP TABLE dbo.NavCorrection;
IF OBJECT_ID(N'dbo.NavConnectorStop', N'U')      IS NOT NULL DROP TABLE dbo.NavConnectorStop;
IF OBJECT_ID(N'dbo.NavConnector', N'U')          IS NOT NULL DROP TABLE dbo.NavConnector;
IF OBJECT_ID(N'dbo.Anchor', N'U')                IS NOT NULL DROP TABLE dbo.Anchor;
IF OBJECT_ID(N'dbo.TransitPoint', N'U')          IS NOT NULL DROP TABLE dbo.TransitPoint;
IF OBJECT_ID(N'dbo.Amenity', N'U')               IS NOT NULL DROP TABLE dbo.Amenity;
IF OBJECT_ID(N'dbo.Occupant', N'U')              IS NOT NULL DROP TABLE dbo.Occupant;
IF OBJECT_ID(N'dbo.FloorObject', N'U')           IS NOT NULL DROP TABLE dbo.FloorObject;
IF OBJECT_ID(N'dbo.FloorUnderlay', N'U')         IS NOT NULL DROP TABLE dbo.FloorUnderlay;
IF OBJECT_ID(N'dbo.Opening', N'U')               IS NOT NULL DROP TABLE dbo.Opening;
IF OBJECT_ID(N'dbo.Unit', N'U')                  IS NOT NULL DROP TABLE dbo.Unit;
IF OBJECT_ID(N'dbo.Level', N'U')                 IS NOT NULL DROP TABLE dbo.Level;
IF OBJECT_ID(N'dbo.Building', N'U')              IS NOT NULL DROP TABLE dbo.Building;
IF OBJECT_ID(N'dbo.UserVenueGrant', N'U')        IS NOT NULL DROP TABLE dbo.UserVenueGrant;
IF OBJECT_ID(N'dbo.Venue', N'U')                 IS NOT NULL DROP TABLE dbo.Venue;
IF OBJECT_ID(N'dbo.StoreStatus', N'U')           IS NOT NULL DROP TABLE dbo.StoreStatus;
IF OBJECT_ID(N'dbo.BeaconModel', N'U')           IS NOT NULL DROP TABLE dbo.BeaconModel;
IF OBJECT_ID(N'dbo.ObjectType', N'U')            IS NOT NULL DROP TABLE dbo.ObjectType;
IF OBJECT_ID(N'dbo.ConnectorType', N'U')         IS NOT NULL DROP TABLE dbo.ConnectorType;
IF OBJECT_ID(N'dbo.TransitType', N'U')           IS NOT NULL DROP TABLE dbo.TransitType;
IF OBJECT_ID(N'dbo.AmenityType', N'U')           IS NOT NULL DROP TABLE dbo.AmenityType;
IF OBJECT_ID(N'dbo.OccupantCategory', N'U')      IS NOT NULL DROP TABLE dbo.OccupantCategory;
IF OBJECT_ID(N'dbo.BuildingType', N'U')          IS NOT NULL DROP TABLE dbo.BuildingType;
IF OBJECT_ID(N'dbo.StoredFile', N'U')            IS NOT NULL DROP TABLE dbo.StoredFile;
IF OBJECT_ID(N'dbo.GlobalSetting', N'U')         IS NOT NULL DROP TABLE dbo.GlobalSetting;
IF OBJECT_ID(N'dbo.UserRole', N'U')              IS NOT NULL DROP TABLE dbo.UserRole;
IF OBJECT_ID(N'dbo.UserPermission', N'U')        IS NOT NULL DROP TABLE dbo.UserPermission;
IF OBJECT_ID(N'dbo.RolePermission', N'U')        IS NOT NULL DROP TABLE dbo.RolePermission;
IF OBJECT_ID(N'dbo.PermissionRoute', N'U')       IS NOT NULL DROP TABLE dbo.PermissionRoute;
IF OBJECT_ID(N'dbo.Role', N'U')                  IS NOT NULL DROP TABLE dbo.Role;
IF OBJECT_ID(N'dbo.RefreshToken', N'U')          IS NOT NULL DROP TABLE dbo.RefreshToken;
IF OBJECT_ID(N'dbo.AppUser', N'U')               IS NOT NULL DROP TABLE dbo.AppUser;
IF OBJECT_ID(N'dbo.Tenant', N'U')                IS NOT NULL DROP TABLE dbo.Tenant;
GO

/* ---------------------------------------------------------------------
   1. Platform, identity, access (standard §3.3–§3.5; roles L41)
   --------------------------------------------------------------------- */
CREATE TABLE dbo.Tenant (
    TenantId             INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_Tenant PRIMARY KEY,
    Code                 NVARCHAR(40)       NOT NULL,
    Name                 NVARCHAR(200)      NOT NULL,
    BeaconProximityUuid  UNIQUEIDENTIFIER   NULL,   -- invariant 9: one Gabay-assigned UUID per tenant
    IsActive             BIT                NOT NULL CONSTRAINT DF_Tenant_IsActive DEFAULT 1,
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_Tenant_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT                NULL,
    UpdatedAt            DATETIME2(3)       NULL,
    CONSTRAINT UQ_Tenant_Code UNIQUE (Code),
    CONSTRAINT UQ_Tenant_TenantId_Uuid UNIQUE (TenantId, BeaconProximityUuid)  -- target of Beacon's composite FK
);
CREATE UNIQUE INDEX UX_Tenant_BeaconProximityUuid ON dbo.Tenant (BeaconProximityUuid)
    WHERE BeaconProximityUuid IS NOT NULL;  -- serves: namespace uniqueness across the platform
GO

CREATE TABLE dbo.AppUser (
    UserId               INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_AppUser PRIMARY KEY,
    TenantId             INT                NULL CONSTRAINT FK_AppUser_Tenant REFERENCES dbo.Tenant (TenantId),
                                            -- NULL = IQ platform staff (SuperAdmin / IQ admin)
    Email                NVARCHAR(254)      NOT NULL,
    PasswordHash         NVARCHAR(100)      NOT NULL,  -- bcryptjs cost 10 (standard §1)
    DisplayName          NVARCHAR(120)      NOT NULL,
    FailedLoginCount     INT                NOT NULL CONSTRAINT DF_AppUser_Failed DEFAULT 0,
    LockedUntil          DATETIME2(3)       NULL,      -- threshold from GlobalSetting (§12 item 10)
    ActiveSessionId      UNIQUEIDENTIFIER   NULL,      -- standard §3.3 single active session (setting auth.singleSession); matched against the JWT's session id
    ChangePassword       BIT                NOT NULL CONSTRAINT DF_AppUser_ChangePassword DEFAULT 0,  -- §3.3 forced password change, checked at login
    PasswordChangedAt    DATETIME2(3)       NULL,      -- §3.3 optional expiry, computed at login from a setting
    IsActive             BIT                NOT NULL CONSTRAINT DF_AppUser_IsActive DEFAULT 1,
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_AppUser_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT                NULL,
    UpdatedAt            DATETIME2(3)       NULL,
    CONSTRAINT UQ_AppUser_Email UNIQUE (Email)
);
GO

-- Admin refresh tokens, rotated on every use (Blueprint 2.4). Only a SHA-256 of the token is stored.
-- Shopper sessions wait on D1b (sign-in method). DESIGN CHOICE: one row per issued token, chained by
-- ReplacedByRefreshTokenId, so reuse of a rotated token is detectable and revokes its chain. The
-- alternative is a single current-token column on AppUser, which cannot detect reuse.
CREATE TABLE dbo.RefreshToken (
    RefreshTokenId       BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_RefreshToken PRIMARY KEY,
    UserId               INT                NOT NULL CONSTRAINT FK_RefreshToken_User REFERENCES dbo.AppUser (UserId),
    SessionId            UNIQUEIDENTIFIER   NOT NULL,  -- the session the token belongs to (compared with AppUser.ActiveSessionId)
    TokenSha256          CHAR(64)           NOT NULL,
    ExpiresAt            DATETIME2(3)       NOT NULL,  -- lifetime from a setting, not a literal
    RevokedAt            DATETIME2(3)       NULL,
    ReplacedByRefreshTokenId BIGINT         NULL CONSTRAINT FK_RefreshToken_ReplacedBy REFERENCES dbo.RefreshToken (RefreshTokenId),
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_RefreshToken_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_RefreshToken_Hash UNIQUE (TokenSha256)  -- serves: token lookup on refresh
);
CREATE INDEX IX_RefreshToken_User ON dbo.RefreshToken (UserId, RevokedAt);  -- serves: revoke all of a user's tokens (logout, lockout)
GO

CREATE TABLE dbo.Role (
    RoleId               INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_Role PRIMARY KEY,
    Code                 NVARCHAR(40)       NOT NULL,   -- seeded: SUPERADMIN, MALL_ADMIN, VENUE_EDITOR, VIEWER;
                                                        -- next release: MERCHANT, UNIT, MAINTENANCE (L41)
    Label                NVARCHAR(100)      NOT NULL,
    IsPlatformRole       BIT                NOT NULL CONSTRAINT DF_Role_Platform DEFAULT 0,
    IsActive             BIT                NOT NULL CONSTRAINT DF_Role_IsActive DEFAULT 1,
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_Role_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT                NULL,
    UpdatedAt            DATETIME2(3)       NULL,
    CONSTRAINT UQ_Role_Code UNIQUE (Code)
);
GO

-- Standard §3.4 Layer 2: route x Create/Read/Update/Delete. One row per guarded API route group,
-- seeded by migration as routes are built (a route exists only in code, so this list follows the code).
CREATE TABLE dbo.PermissionRoute (
    PermissionRouteId    INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_PermissionRoute PRIMARY KEY,
    RouteKey             NVARCHAR(80)       NOT NULL,   -- e.g. venues, editor-drafts, venue-versions, beacons
    Label                NVARCHAR(200)      NOT NULL,
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_PermissionRoute_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT                NULL,
    UpdatedAt            DATETIME2(3)       NULL,
    CONSTRAINT UQ_PermissionRoute_Key UNIQUE (RouteKey)  -- serves: guard lookup by route key
);
GO

-- The role row is the default. Publishing is Create on venue-versions, which the Venue Editor role lacks (L41).
-- A user holding several roles gets the OR of their role rows.
CREATE TABLE dbo.RolePermission (
    RoleId               INT                NOT NULL CONSTRAINT FK_RolePermission_Role REFERENCES dbo.Role (RoleId),
    PermissionRouteId    INT                NOT NULL CONSTRAINT FK_RolePermission_Route REFERENCES dbo.PermissionRoute (PermissionRouteId),
    CanCreate            BIT                NOT NULL CONSTRAINT DF_RolePermission_C DEFAULT 0,
    CanRead              BIT                NOT NULL CONSTRAINT DF_RolePermission_R DEFAULT 0,
    CanUpdate            BIT                NOT NULL CONSTRAINT DF_RolePermission_U DEFAULT 0,
    CanDelete            BIT                NOT NULL CONSTRAINT DF_RolePermission_D DEFAULT 0,
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_RolePermission_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT                NULL,
    UpdatedAt            DATETIME2(3)       NULL,
    CONSTRAINT PK_RolePermission PRIMARY KEY (RoleId, PermissionRouteId)  -- serves: permission merge at login and in the guard
);
GO

-- Per-user rows REPLACE the merged role row for that route (§3.4); the same merge runs at login and in the guard.
CREATE TABLE dbo.UserPermission (
    UserId               INT                NOT NULL CONSTRAINT FK_UserPermission_User REFERENCES dbo.AppUser (UserId),
    PermissionRouteId    INT                NOT NULL CONSTRAINT FK_UserPermission_Route REFERENCES dbo.PermissionRoute (PermissionRouteId),
    CanCreate            BIT                NOT NULL CONSTRAINT DF_UserPermission_C DEFAULT 0,
    CanRead              BIT                NOT NULL CONSTRAINT DF_UserPermission_R DEFAULT 0,
    CanUpdate            BIT                NOT NULL CONSTRAINT DF_UserPermission_U DEFAULT 0,
    CanDelete            BIT                NOT NULL CONSTRAINT DF_UserPermission_D DEFAULT 0,
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_UserPermission_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT                NULL,
    UpdatedAt            DATETIME2(3)       NULL,
    CONSTRAINT PK_UserPermission PRIMARY KEY (UserId, PermissionRouteId)  -- serves: permission merge at login and in the guard
);
GO

CREATE TABLE dbo.UserRole (
    UserRoleId           INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_UserRole PRIMARY KEY,
    UserId               INT                NOT NULL CONSTRAINT FK_UserRole_User REFERENCES dbo.AppUser (UserId),
    RoleId               INT                NOT NULL CONSTRAINT FK_UserRole_Role REFERENCES dbo.Role (RoleId),
    TenantId             INT                NULL CONSTRAINT FK_UserRole_Tenant REFERENCES dbo.Tenant (TenantId),
                                            -- NULL only for platform roles
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_UserRole_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT                NULL,
    UpdatedAt            DATETIME2(3)       NULL
);
CREATE UNIQUE INDEX UX_UserRole ON dbo.UserRole (UserId, RoleId, TenantId);  -- serves: permission merge per user at login
GO

CREATE TABLE dbo.GlobalSetting (
    GlobalSettingId      INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_GlobalSetting PRIMARY KEY,
    TenantId             INT                NULL CONSTRAINT FK_GlobalSetting_Tenant REFERENCES dbo.Tenant (TenantId),
                                            -- NULL = platform default; non-NULL = tenant override (§3.16)
    SettingKey           NVARCHAR(80)       NOT NULL,   -- e.g. auth.lockoutThreshold, auth.singleSession
    SettingValue         NVARCHAR(400)      NOT NULL,
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_GlobalSetting_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT                NULL,
    UpdatedAt            DATETIME2(3)       NULL
);
CREATE UNIQUE INDEX UX_GlobalSetting ON dbo.GlobalSetting (TenantId, SettingKey);  -- serves: resolver lookup
GO

CREATE TABLE dbo.StoredFile (
    FileId               BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_StoredFile PRIMARY KEY,
    TenantId             INT                NULL CONSTRAINT FK_StoredFile_Tenant REFERENCES dbo.Tenant (TenantId),
    Purpose              NVARCHAR(20)       NOT NULL CONSTRAINT CK_StoredFile_Purpose
                             CHECK (Purpose IN (N'LOGO', N'UNDERLAY', N'PACKAGE', N'CAD_IMPORT')),  -- §3.15; constants file; closed: each purpose has its own upload validation and storage path in code
    MimeType             NVARCHAR(100)      NOT NULL,
    SizeBytes            BIGINT             NOT NULL,
    Sha256               CHAR(64)           NOT NULL,
    StoragePath          NVARCHAR(400)      NOT NULL,
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_StoredFile_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT                NULL,
    UpdatedAt            DATETIME2(3)       NULL,
    CONSTRAINT UQ_StoredFile_Tenant_File UNIQUE (TenantId, FileId)  -- composite-FK target for tenant-owned files
);
-- No secondary index: StoredFile is always fetched by FileId (the primary key).
GO

/* ---------------------------------------------------------------------
   2. Lookup tables (standard §3.19; served by /api/lookups/:name)
      TenantId NULL = platform-wide default owned by SuperAdmin (L41).
   --------------------------------------------------------------------- */
CREATE TABLE dbo.BuildingType (
    BuildingTypeId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_BuildingType PRIMARY KEY,
    TenantId INT NULL CONSTRAINT FK_BuildingType_Tenant REFERENCES dbo.Tenant (TenantId),
    Code NVARCHAR(40) NOT NULL, Label NVARCHAR(100) NOT NULL,        -- MAIN, WING, ANNEX, PARKING
    SortOrder INT NOT NULL CONSTRAINT DF_BuildingType_Sort DEFAULT 0,
    IsActive BIT NOT NULL CONSTRAINT DF_BuildingType_IsActive DEFAULT 1,
    CreatedBy INT NULL, CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_BuildingType_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy INT NULL, UpdatedAt DATETIME2(3) NULL
);
CREATE UNIQUE INDEX UX_BuildingType_Code ON dbo.BuildingType (TenantId, Code);  -- serves: code uniqueness per tenant; /api/lookups/:name
GO

CREATE TABLE dbo.OccupantCategory (
    OccupantCategoryId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_OccupantCategory PRIMARY KEY,
    TenantId INT NULL CONSTRAINT FK_OccupantCategory_Tenant REFERENCES dbo.Tenant (TenantId),
    Code NVARCHAR(40) NOT NULL, Label NVARCHAR(100) NOT NULL,        -- FASHION, DINING, SERVICES, ...
    SortOrder INT NOT NULL CONSTRAINT DF_OccupantCategory_Sort DEFAULT 0,
    IsActive BIT NOT NULL CONSTRAINT DF_OccupantCategory_IsActive DEFAULT 1,
    CreatedBy INT NULL, CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_OccupantCategory_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy INT NULL, UpdatedAt DATETIME2(3) NULL
);
CREATE UNIQUE INDEX UX_OccupantCategory_Code ON dbo.OccupantCategory (TenantId, Code);  -- serves: code uniqueness per tenant; /api/lookups/:name
GO

CREATE TABLE dbo.AmenityType (
    AmenityTypeId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AmenityType PRIMARY KEY,
    TenantId INT NULL CONSTRAINT FK_AmenityType_Tenant REFERENCES dbo.Tenant (TenantId),
    Code NVARCHAR(40) NOT NULL, Label NVARCHAR(100) NOT NULL,        -- CR, CR_PWD, NURSING, PRAYER, FIRST_AID,
                                                                     -- SECURITY, INFO, ATM (L29), EV_CHARGING,
                                                                     -- REFUGE_AREA, ASSEMBLY_AREA (L87, evacuation)
    SearchSynonyms NVARCHAR(400) NULL,                               -- e.g. "comfort room, restroom, toilet"
    IsAccessible BIT NOT NULL CONSTRAINT DF_AmenityType_Accessible DEFAULT 0,
    SortOrder INT NOT NULL CONSTRAINT DF_AmenityType_Sort DEFAULT 0,
    IsActive BIT NOT NULL CONSTRAINT DF_AmenityType_IsActive DEFAULT 1,
    CreatedBy INT NULL, CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_AmenityType_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy INT NULL, UpdatedAt DATETIME2(3) NULL
);
CREATE UNIQUE INDEX UX_AmenityType_Code ON dbo.AmenityType (TenantId, Code);  -- serves: code uniqueness per tenant; /api/lookups/:name
GO

CREATE TABLE dbo.TransitType (
    TransitTypeId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TransitType PRIMARY KEY,
    TenantId INT NULL CONSTRAINT FK_TransitType_Tenant REFERENCES dbo.Tenant (TenantId),
    Code NVARCHAR(40) NOT NULL, Label NVARCHAR(100) NOT NULL,        -- TRAIN_BRIDGE, TERMINAL, JEEPNEY_BAY,
                                                                     -- TAXI_BAY, PARKING_ENTRY, DROP_OFF (L30)
    SortOrder INT NOT NULL CONSTRAINT DF_TransitType_Sort DEFAULT 0,
    IsActive BIT NOT NULL CONSTRAINT DF_TransitType_IsActive DEFAULT 1,
    CreatedBy INT NULL, CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_TransitType_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy INT NULL, UpdatedAt DATETIME2(3) NULL
);
CREATE UNIQUE INDEX UX_TransitType_Code ON dbo.TransitType (TenantId, Code);  -- serves: code uniqueness per tenant; /api/lookups/:name
GO

CREATE TABLE dbo.ConnectorType (
    ConnectorTypeId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ConnectorType PRIMARY KEY,
    TenantId INT NULL CONSTRAINT FK_ConnectorType_Tenant REFERENCES dbo.Tenant (TenantId),
    Code NVARCHAR(40) NOT NULL, Label NVARCHAR(100) NOT NULL,
    CostModel NVARCHAR(20) NOT NULL CONSTRAINT CK_ConnectorType_CostModel
        CHECK (CostModel IN (N'ESCALATOR', N'STAIRS', N'ELEVATOR', N'RAMP', N'LEVEL')),  -- constants file; closed: each value is a connector behaviour in code (step-free, evacuation); connector TYPES are this lookup
    IsStepFree BIT NOT NULL,                                          -- L37 step-free mode filter
    -- L86: routes are ranked by metres. A floor change costs CostBaseM + CostPerRiseM x the height climbed (m),
    -- tunable per type by the mall. Demo defaults: lift 30 + 1.5, stairs 34 + 3, escalator 14 + 1, ramp 20 + 2.
    CostBaseM DECIMAL(9,3) NOT NULL CONSTRAINT DF_ConnectorType_CostBase DEFAULT 0,
    CostPerRiseM DECIMAL(9,3) NOT NULL CONSTRAINT DF_ConnectorType_CostPerRise DEFAULT 0,
    SortOrder INT NOT NULL CONSTRAINT DF_ConnectorType_Sort DEFAULT 0,
    IsActive BIT NOT NULL CONSTRAINT DF_ConnectorType_IsActive DEFAULT 1,
    CreatedBy INT NULL, CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_ConnectorType_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy INT NULL, UpdatedAt DATETIME2(3) NULL
);
CREATE UNIQUE INDEX UX_ConnectorType_Code ON dbo.ConnectorType (TenantId, Code);  -- serves: code uniqueness per tenant; /api/lookups/:name
GO

CREATE TABLE dbo.ObjectType (
    ObjectTypeId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ObjectType PRIMARY KEY,
    TenantId INT NULL CONSTRAINT FK_ObjectType_Tenant REFERENCES dbo.Tenant (TenantId),
    Code NVARCHAR(40) NOT NULL, Label NVARCHAR(100) NOT NULL,        -- PILLAR, KIOSK, STALL, BENCH, PLANTER, ... (L39 library)
    DefaultWidthM DECIMAL(9,3) NULL, DefaultDepthM DECIMAL(9,3) NULL, DefaultHeightM DECIMAL(9,3) NULL,
    BlocksWalk BIT NOT NULL CONSTRAINT DF_ObjectType_Blocks DEFAULT 1,
    SignalPenaltyDb DECIMAL(5,2) NULL,                                -- L40 RSSI model penalty (e.g. concrete pillar)
    SortOrder INT NOT NULL CONSTRAINT DF_ObjectType_Sort DEFAULT 0,
    IsActive BIT NOT NULL CONSTRAINT DF_ObjectType_IsActive DEFAULT 1,
    CreatedBy INT NULL, CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_ObjectType_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy INT NULL, UpdatedAt DATETIME2(3) NULL
);
CREATE UNIQUE INDEX UX_ObjectType_Code ON dbo.ObjectType (TenantId, Code);  -- serves: code uniqueness per tenant; /api/lookups/:name
GO

CREATE TABLE dbo.BeaconModel (
    BeaconModelId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_BeaconModel PRIMARY KEY,
    TenantId INT NULL CONSTRAINT FK_BeaconModel_Tenant REFERENCES dbo.Tenant (TenantId),
    Code NVARCHAR(40) NOT NULL, Label NVARCHAR(100) NOT NULL,
    UnitPrice DECIMAL(18,4) NULL,                                     -- admin-entered; L40 cost estimate
    BatteryLifeMonths INT NULL,
    IpRating NVARCHAR(10) NULL,                                       -- e.g. IP67 for semi-outdoor mounts
    IsActive BIT NOT NULL CONSTRAINT DF_BeaconModel_IsActive DEFAULT 1,
    CreatedBy INT NULL, CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_BeaconModel_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy INT NULL, UpdatedAt DATETIME2(3) NULL
);
CREATE UNIQUE INDEX UX_BeaconModel_Code ON dbo.BeaconModel (TenantId, Code);  -- serves: code uniqueness per tenant; /api/lookups/:name
GO

-- L83: store status, as the 3D navigation mock-up shows it on pins and place cards. Mall-extensible (§4.10).
-- Seeded platform rows (reference seed): OPEN (IsRoutable 1), CLOSED, MAINTENANCE ("Being repaired"),
-- COMING_SOON ("Opening soon"), all IsRoutable 0. The mock-up dims a non-routable pin and disables Go;
-- code reads IsRoutable, never a code string. Complete per §4.10: seed rows, an allow-list entry, a maintenance
-- screen and its permission route, at Phase 1.
CREATE TABLE dbo.StoreStatus (
    StoreStatusId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_StoreStatus PRIMARY KEY,
    TenantId INT NULL CONSTRAINT FK_StoreStatus_Tenant REFERENCES dbo.Tenant (TenantId),
    Code NVARCHAR(40) NOT NULL, Label NVARCHAR(100) NOT NULL,
    IsRoutable BIT NOT NULL CONSTRAINT DF_StoreStatus_IsRoutable DEFAULT 0,  -- 1 = shoppers can start a route to it
    SortOrder INT NOT NULL CONSTRAINT DF_StoreStatus_Sort DEFAULT 0,
    IsActive BIT NOT NULL CONSTRAINT DF_StoreStatus_IsActive DEFAULT 1,
    CreatedBy INT NULL, CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_StoreStatus_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy INT NULL, UpdatedAt DATETIME2(3) NULL
);
CREATE UNIQUE INDEX UX_StoreStatus_Code ON dbo.StoreStatus (TenantId, Code);  -- serves: code uniqueness per tenant; /api/lookups/:name
GO

/* ---------------------------------------------------------------------
   3. Venue model: whole site (L30), nested facilities (L29), editor (L39)
      Coordinates: local planar metres per level (invariant 2).
      Geometry: GeoJSON in NVARCHAR(MAX) with ISJSON; any geometry column is
      written only as WKT through STGeomFromText(@wkt) (0.3 rule).
   --------------------------------------------------------------------- */
CREATE TABLE dbo.Venue (
    VenueId              INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_Venue PRIMARY KEY,
    TenantId             INT                NOT NULL CONSTRAINT FK_Venue_Tenant REFERENCES dbo.Tenant (TenantId),
    Code                 NVARCHAR(40)       NOT NULL,
    Name                 NVARCHAR(200)      NOT NULL,
    BoundaryGeoJson      NVARCHAR(MAX)      NOT NULL CONSTRAINT CK_Venue_Boundary CHECK (ISJSON(BoundaryGeoJson) = 1),
                                            -- invariant 10: the whole property (L30)
    GeoreferenceJson     NVARCHAR(MAX)      NULL CONSTRAINT CK_Venue_Georef CHECK (GeoreferenceJson IS NULL OR ISJSON(GeoreferenceJson) = 1),
                                            -- local metres -> WGS84 transform; needed for the GNSS outdoor dot (L31)
    EvacEscalatorsAllowed BIT               NOT NULL CONSTRAINT DF_Venue_EvacEscalators DEFAULT 1,  -- L87: the mall's safety plan; the demo allows them
    IsActive             BIT                NOT NULL CONSTRAINT DF_Venue_IsActive DEFAULT 1,
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_Venue_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT                NULL,
    UpdatedAt            DATETIME2(3)       NULL,
    CONSTRAINT UQ_Venue_Tenant_Code UNIQUE (TenantId, Code),
    CONSTRAINT UQ_Venue_Tenant_Venue UNIQUE (TenantId, VenueId)   -- composite-FK target
);
GO

CREATE TABLE dbo.UserVenueGrant (
    UserVenueGrantId     INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_UserVenueGrant PRIMARY KEY,
    TenantId             INT                NOT NULL,
    UserId               INT                NOT NULL CONSTRAINT FK_UserVenueGrant_User REFERENCES dbo.AppUser (UserId),
    VenueId              INT                NOT NULL,
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_UserVenueGrant_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT                NULL,
    UpdatedAt            DATETIME2(3)       NULL,
    CONSTRAINT FK_UserVenueGrant_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES dbo.Venue (TenantId, VenueId),
    CONSTRAINT UQ_UserVenueGrant UNIQUE (UserId, VenueId)          -- serves: per-venue authorization check
);
GO

CREATE TABLE dbo.Building (
    BuildingId           INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_Building PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    BuildingTypeId       INT                NOT NULL CONSTRAINT FK_Building_Type REFERENCES dbo.BuildingType (BuildingTypeId),
    Name                 NVARCHAR(200)      NOT NULL,
    FootprintGeoJson     NVARCHAR(MAX)      NULL CONSTRAINT CK_Building_Footprint CHECK (FootprintGeoJson IS NULL OR ISJSON(FootprintGeoJson) = 1),
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_Building_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT                NULL,
    UpdatedAt            DATETIME2(3)       NULL,
    CONSTRAINT FK_Building_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES dbo.Venue (TenantId, VenueId),
    CONSTRAINT UQ_Building_Tenant_Building UNIQUE (TenantId, BuildingId)
);
CREATE INDEX IX_Building_Venue ON dbo.Building (TenantId, VenueId);  -- serves: site load in the editor, package build
GO

CREATE TABLE dbo.Level (
    LevelId              INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_Level PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    BuildingId           INT                NULL,      -- NULL = outdoor ground of the venue (L30)
    Ordinal              INT                NOT NULL,  -- IMDF-style: 0 ground, negative below
    Name                 NVARCHAR(100)      NOT NULL,
    ShortName            NVARCHAR(10)       NOT NULL,
    IsOutdoor            BIT                NOT NULL CONSTRAINT DF_Level_IsOutdoor DEFAULT 0,
    ElevationM           DECIMAL(9,3)       NOT NULL CONSTRAINT DF_Level_Elevation DEFAULT 0,
    WidthM               DECIMAL(9,3)       NOT NULL,  -- editor floor size (L39), e.g. 40.000
    DepthM               DECIMAL(9,3)       NOT NULL,
    GridCellM            DECIMAL(5,2)       NOT NULL CONSTRAINT DF_Level_GridCell DEFAULT 1.00
                             CONSTRAINT CK_Level_GridCell CHECK (GridCellM BETWEEN 0.25 AND 2.00),
    CeilingHeightM       DECIMAL(5,2)       NULL,      -- L40 mount-height candidates
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_Level_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT                NULL,
    UpdatedAt            DATETIME2(3)       NULL,
    CONSTRAINT FK_Level_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES dbo.Venue (TenantId, VenueId),
    CONSTRAINT FK_Level_Building FOREIGN KEY (TenantId, BuildingId) REFERENCES dbo.Building (TenantId, BuildingId),
    CONSTRAINT CK_Level_OutdoorBuilding CHECK ((IsOutdoor = 1 AND BuildingId IS NULL) OR (IsOutdoor = 0 AND BuildingId IS NOT NULL)),
    CONSTRAINT UQ_Level_Tenant_Level UNIQUE (TenantId, LevelId)
);
CREATE INDEX IX_Level_Venue ON dbo.Level (TenantId, VenueId, Ordinal);  -- serves: editor floor list, package build
GO

CREATE TABLE dbo.Unit (
    UnitId               INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_Unit PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    LevelId              INT                NOT NULL,
    ParentUnitId         INT                NULL,
                                            -- nested facility interiors and sections (L29)
    ImdfCategory         NVARCHAR(40)       NOT NULL,  -- IMDF 1.0.0 unit category; constants file
    Name                 NVARCHAR(200)      NULL,
    ShapeKind            NVARCHAR(10)       NOT NULL CONSTRAINT CK_Unit_Shape CHECK (ShapeKind IN (N'BOX', N'POLYGON')),  -- L39; constants file; closed: each kind is geometry code
    CenterX              DECIMAL(9,3)       NULL, CenterY DECIMAL(9,3) NULL,
    WidthM               DECIMAL(9,3)       NULL, DepthM  DECIMAL(9,3) NULL,
    RotationDeg          DECIMAL(6,2)       NULL,
    GeometryGeoJson      NVARCHAR(MAX)      NOT NULL CONSTRAINT CK_Unit_Geometry CHECK (ISJSON(GeometryGeoJson) = 1),
                                            -- always stored; derived from box params when ShapeKind = BOX
    IsWalkable           BIT                NOT NULL,  -- corridors/walkways/open areas = 1; stores' interiors via children
    PassThrough          BIT                NOT NULL CONSTRAINT DF_Unit_PassThrough DEFAULT 0,  -- the mall's walk-through mark (L29, L92): a shortcut only when open and the shopper allows it; publish makes it a passage where it is the only way to a place
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_Unit_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT                NULL,
    UpdatedAt            DATETIME2(3)       NULL,
    CONSTRAINT FK_Unit_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES dbo.Venue (TenantId, VenueId),
    CONSTRAINT FK_Unit_Level FOREIGN KEY (TenantId, LevelId) REFERENCES dbo.Level (TenantId, LevelId),
    CONSTRAINT CK_Unit_BoxParams CHECK (ShapeKind = N'POLYGON' OR (CenterX IS NOT NULL AND CenterY IS NOT NULL AND WidthM > 0 AND DepthM > 0)),
    CONSTRAINT UQ_Unit_Tenant_Unit UNIQUE (TenantId, UnitId)
);
-- Self-reference added after the table exists, so its composite target UQ_Unit_Tenant_Unit is in place.
ALTER TABLE dbo.Unit ADD CONSTRAINT FK_Unit_Parent FOREIGN KEY (TenantId, ParentUnitId) REFERENCES dbo.Unit (TenantId, UnitId);
CREATE INDEX IX_Unit_Level ON dbo.Unit (TenantId, LevelId);  -- serves: editor floor load, walkable-area derivation
GO

CREATE TABLE dbo.Opening (
    OpeningId            INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_Opening PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    LevelId              INT                NOT NULL,
    UnitId               INT                NULL,
    ImdfCategory         NVARCHAR(40)       NOT NULL,  -- IMDF opening category; constants file
    Name                 NVARCHAR(200)      NULL,
    GeometryGeoJson      NVARCHAR(MAX)      NOT NULL CONSTRAINT CK_Opening_Geometry CHECK (ISJSON(GeometryGeoJson) = 1),
    IsVenueEntrance      BIT                NOT NULL CONSTRAINT DF_Opening_Entrance DEFAULT 0,  -- L31 handoff pairs; L40 mandatory beacons
    ClearWidthM          DECIMAL(9,3)       NULL,      -- L88: step-free routes avoid doors under the 1.2 m setting; NULL = not measured
    -- Door direction / access rules deliberately absent: L33 (P2) adds them by migration.
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_Opening_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT                NULL,
    UpdatedAt            DATETIME2(3)       NULL,
    CONSTRAINT FK_Opening_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES dbo.Venue (TenantId, VenueId),
    CONSTRAINT FK_Opening_Level FOREIGN KEY (TenantId, LevelId) REFERENCES dbo.Level (TenantId, LevelId),
    CONSTRAINT FK_Opening_Unit FOREIGN KEY (TenantId, UnitId) REFERENCES dbo.Unit (TenantId, UnitId)
);
CREATE INDEX IX_Opening_Level ON dbo.Opening (TenantId, LevelId);  -- serves: editor floor load, door list for the package build
GO

CREATE TABLE dbo.FloorUnderlay (
    FloorUnderlayId      INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_FloorUnderlay PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,  -- 0.2: invariant 13, queried directly by the editor
    LevelId              INT                NOT NULL,
    FileId               BIGINT             NOT NULL,  -- the tenant's own file (composite FK below)
    -- two-point calibration (L39 traced underlay): image pixels A, B and their real distance
    PxAx DECIMAL(9,2) NOT NULL, PxAy DECIMAL(9,2) NOT NULL,
    PxBx DECIMAL(9,2) NOT NULL, PxBy DECIMAL(9,2) NOT NULL,
    RealDistanceM        DECIMAL(9,3)       NOT NULL CONSTRAINT CK_FloorUnderlay_Dist CHECK (RealDistanceM > 0),
    OffsetX DECIMAL(9,3) NOT NULL CONSTRAINT DF_FloorUnderlay_OX DEFAULT 0,
    OffsetY DECIMAL(9,3) NOT NULL CONSTRAINT DF_FloorUnderlay_OY DEFAULT 0,
    RotationDeg DECIMAL(6,2) NOT NULL CONSTRAINT DF_FloorUnderlay_Rot DEFAULT 0,
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_FloorUnderlay_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT                NULL,
    UpdatedAt            DATETIME2(3)       NULL,
    CONSTRAINT FK_FloorUnderlay_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES dbo.Venue (TenantId, VenueId),
    CONSTRAINT FK_FloorUnderlay_Level FOREIGN KEY (TenantId, LevelId) REFERENCES dbo.Level (TenantId, LevelId),
    CONSTRAINT FK_FloorUnderlay_File FOREIGN KEY (TenantId, FileId) REFERENCES dbo.StoredFile (TenantId, FileId)
);
CREATE INDEX IX_FloorUnderlay_Level ON dbo.FloorUnderlay (TenantId, VenueId, LevelId);  -- serves: editor underlay load per floor
GO

CREATE TABLE dbo.FloorObject (
    FloorObjectId        INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_FloorObject PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    LevelId              INT                NOT NULL,
    ObjectTypeId         INT                NOT NULL CONSTRAINT FK_FloorObject_Type REFERENCES dbo.ObjectType (ObjectTypeId),
    UnitId               INT                NULL,      -- placed inside a unit (e.g. a kiosk inside an atrium)
    ShapeKind            NVARCHAR(10)       NOT NULL CONSTRAINT CK_FloorObject_Shape CHECK (ShapeKind IN (N'BOX', N'POLYGON')),  -- L39; constants file; closed: each kind is geometry code
    CenterX DECIMAL(9,3) NOT NULL, CenterY DECIMAL(9,3) NOT NULL,
    WidthM  DECIMAL(9,3) NULL, DepthM DECIMAL(9,3) NULL, HeightM DECIMAL(9,3) NULL,
    RotationDeg          DECIMAL(6,2)       NOT NULL CONSTRAINT DF_FloorObject_Rot DEFAULT 0,
    GeometryGeoJson      NVARCHAR(MAX)      NULL CONSTRAINT CK_FloorObject_Geometry CHECK (GeometryGeoJson IS NULL OR ISJSON(GeometryGeoJson) = 1),
    BlocksWalk           BIT                NOT NULL,  -- copied from ObjectType, overridable
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_FloorObject_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT                NULL,
    UpdatedAt            DATETIME2(3)       NULL,
    CONSTRAINT FK_FloorObject_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES dbo.Venue (TenantId, VenueId),
    CONSTRAINT FK_FloorObject_Level FOREIGN KEY (TenantId, LevelId) REFERENCES dbo.Level (TenantId, LevelId),
    CONSTRAINT FK_FloorObject_Unit FOREIGN KEY (TenantId, UnitId) REFERENCES dbo.Unit (TenantId, UnitId),
    CONSTRAINT CK_FloorObject_Geom CHECK ((ShapeKind = N'BOX' AND WidthM > 0 AND DepthM > 0) OR (ShapeKind = N'POLYGON' AND GeometryGeoJson IS NOT NULL))
);
CREATE INDEX IX_FloorObject_Level ON dbo.FloorObject (TenantId, LevelId);  -- serves: editor floor load
GO

CREATE TABLE dbo.Occupant (
    OccupantId           INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_Occupant PRIMARY KEY,
    TenantId             INT                NOT NULL,   -- "tenant" = mall operator; stores are Occupants (invariant 1)
    VenueId              INT                NOT NULL,
    UnitId               INT                NOT NULL,
    OccupantCategoryId   INT                NOT NULL CONSTRAINT FK_Occupant_Category REFERENCES dbo.OccupantCategory (OccupantCategoryId),
    StoreStatusId        INT                NOT NULL CONSTRAINT FK_Occupant_Status REFERENCES dbo.StoreStatus (StoreStatusId),  -- L83; lookup: single-column by design (header)
    Name                 NVARCHAR(200)      NOT NULL,
    SearchKeywords       NVARCHAR(400)      NULL,       -- FTS5 in the package (D6)
    LogoFileId           BIGINT             NULL,      -- the tenant's own file (composite FK below)
    IsActive             BIT                NOT NULL CONSTRAINT DF_Occupant_IsActive DEFAULT 1,
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_Occupant_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT                NULL,
    UpdatedAt            DATETIME2(3)       NULL,
    CONSTRAINT FK_Occupant_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES dbo.Venue (TenantId, VenueId),
    CONSTRAINT FK_Occupant_Unit FOREIGN KEY (TenantId, UnitId) REFERENCES dbo.Unit (TenantId, UnitId),
    CONSTRAINT FK_Occupant_Logo FOREIGN KEY (TenantId, LogoFileId) REFERENCES dbo.StoredFile (TenantId, FileId)
);
CREATE INDEX IX_Occupant_Venue ON dbo.Occupant (TenantId, VenueId, IsActive, Name);  -- serves: directory build at publish
GO

CREATE TABLE dbo.Amenity (
    AmenityId            INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_Amenity PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    LevelId              INT                NOT NULL,
    UnitId               INT                NULL,
    AmenityTypeId        INT                NOT NULL CONSTRAINT FK_Amenity_Type REFERENCES dbo.AmenityType (AmenityTypeId),
    Name                 NVARCHAR(200)      NULL,
    X DECIMAL(9,3) NOT NULL, Y DECIMAL(9,3) NOT NULL,
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_Amenity_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT                NULL,
    UpdatedAt            DATETIME2(3)       NULL,
    CONSTRAINT FK_Amenity_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES dbo.Venue (TenantId, VenueId),
    CONSTRAINT FK_Amenity_Level FOREIGN KEY (TenantId, LevelId) REFERENCES dbo.Level (TenantId, LevelId),
    CONSTRAINT FK_Amenity_Unit FOREIGN KEY (TenantId, UnitId) REFERENCES dbo.Unit (TenantId, UnitId)
);
CREATE INDEX IX_Amenity_Venue ON dbo.Amenity (TenantId, VenueId, AmenityTypeId);  -- serves: "nearest CR" target set at publish
GO

CREATE TABLE dbo.TransitPoint (
    TransitPointId       INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_TransitPoint PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    LevelId              INT                NOT NULL,
    TransitTypeId        INT                NOT NULL CONSTRAINT FK_TransitPoint_Type REFERENCES dbo.TransitType (TransitTypeId),
    Name                 NVARCHAR(200)      NOT NULL,
    X DECIMAL(9,3) NOT NULL, Y DECIMAL(9,3) NOT NULL,   -- inside the venue boundary, at its edge (L30)
    Note                 NVARCHAR(200)      NULL,
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_TransitPoint_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT                NULL,
    UpdatedAt            DATETIME2(3)       NULL,
    CONSTRAINT FK_TransitPoint_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES dbo.Venue (TenantId, VenueId),
    CONSTRAINT FK_TransitPoint_Level FOREIGN KEY (TenantId, LevelId) REFERENCES dbo.Level (TenantId, LevelId)
);
CREATE INDEX IX_TransitPoint_Venue ON dbo.TransitPoint (TenantId, VenueId);  -- serves: directory and package build
GO

CREATE TABLE dbo.Anchor (
    AnchorId             INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_Anchor PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    LevelId              INT                NOT NULL,
    UnitId               INT                NULL,
    Name                 NVARCHAR(200)      NOT NULL,
    X DECIMAL(9,3) NOT NULL, Y DECIMAL(9,3) NOT NULL,
    QrCode               NVARCHAR(64)       NULL,      -- optional QR signage (D4a, L16)
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_Anchor_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT                NULL,
    UpdatedAt            DATETIME2(3)       NULL,
    CONSTRAINT FK_Anchor_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES dbo.Venue (TenantId, VenueId),
    CONSTRAINT FK_Anchor_Level FOREIGN KEY (TenantId, LevelId) REFERENCES dbo.Level (TenantId, LevelId)
);
CREATE UNIQUE INDEX UX_Anchor_QrCode ON dbo.Anchor (QrCode) WHERE QrCode IS NOT NULL;  -- serves: QR scan resolution
GO

/* ---------------------------------------------------------------------
   4. Navigation: connectors (L37, L38) and graph corrections (L32).
      The walkway graph itself is generated at publish and lives only in the
      immutable package (D6 CSR blob); the database keeps inputs and fixes.
   --------------------------------------------------------------------- */
CREATE TABLE dbo.NavConnector (
    NavConnectorId       INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_NavConnector PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    ConnectorTypeId      INT                NOT NULL CONSTRAINT FK_NavConnector_Type REFERENCES dbo.ConnectorType (ConnectorTypeId),
    Name                 NVARCHAR(200)      NOT NULL,
    FromLevelId          INT                NOT NULL,
    FromX DECIMAL(9,3) NOT NULL, FromY DECIMAL(9,3) NOT NULL,
    ToLevelId            INT                NULL,      -- NULL for elevators (stops in NavConnectorStop)
    ToX DECIMAL(9,3) NULL, ToY DECIMAL(9,3) NULL,
    IsBidirectional      BIT                NOT NULL,  -- L86: as the real mall is; a one-way escalator row is used only From -> To
    IsEvacuationOnly     BIT                NOT NULL CONSTRAINT DF_NavConnector_EvacOnly DEFAULT 0,  -- L87: used only in an evacuation (e.g. stairs to basements)
    RiseM                DECIMAL(9,3)       NULL,      -- height (L39); feeds the L86 metre cost (CostPerRiseM x rise)
    -- 0.5: InclineDeg, SpeedMps, DoorCycleS and ExpectedWaitS removed; routes are by metres (L86, superseding L38).
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_NavConnector_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT                NULL,
    UpdatedAt            DATETIME2(3)       NULL,
    CONSTRAINT FK_NavConnector_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES dbo.Venue (TenantId, VenueId),
    CONSTRAINT FK_NavConnector_From FOREIGN KEY (TenantId, FromLevelId) REFERENCES dbo.Level (TenantId, LevelId),
    CONSTRAINT FK_NavConnector_To FOREIGN KEY (TenantId, ToLevelId) REFERENCES dbo.Level (TenantId, LevelId),
    CONSTRAINT UQ_NavConnector_Tenant_Conn UNIQUE (TenantId, NavConnectorId)
);
CREATE INDEX IX_NavConnector_Venue ON dbo.NavConnector (TenantId, VenueId);  -- serves: package build, live-status targets
GO

CREATE TABLE dbo.NavConnectorStop (
    NavConnectorStopId   INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_NavConnectorStop PRIMARY KEY,
    TenantId             INT                NOT NULL,
    NavConnectorId       INT                NOT NULL,
    LevelId              INT                NOT NULL,
    X DECIMAL(9,3) NOT NULL, Y DECIMAL(9,3) NOT NULL,
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_NavConnectorStop_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT                NULL,
    UpdatedAt            DATETIME2(3)       NULL,
    CONSTRAINT FK_NavConnectorStop_Conn FOREIGN KEY (TenantId, NavConnectorId) REFERENCES dbo.NavConnector (TenantId, NavConnectorId),
    CONSTRAINT FK_NavConnectorStop_Level FOREIGN KEY (TenantId, LevelId) REFERENCES dbo.Level (TenantId, LevelId),
    CONSTRAINT UQ_NavConnectorStop UNIQUE (NavConnectorId, LevelId)   -- one stop per floor served
);
GO

CREATE TABLE dbo.NavCorrection (
    NavCorrectionId      INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_NavCorrection PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    LevelId              INT                NOT NULL,
    CorrectionKind       NVARCHAR(20)       NOT NULL CONSTRAINT CK_NavCorrection_Kind
                             CHECK (CorrectionKind IN (N'BLOCK_AREA', N'ADD_PATH', N'REMOVE_PATH')),  -- L32; constants file; closed: each kind is a graph-generation operation in code
    GeometryGeoJson      NVARCHAR(MAX)      NOT NULL CONSTRAINT CK_NavCorrection_Geometry CHECK (ISJSON(GeometryGeoJson) = 1),
    Note                 NVARCHAR(200)      NULL,
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_NavCorrection_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT                NULL,
    UpdatedAt            DATETIME2(3)       NULL,
    CONSTRAINT FK_NavCorrection_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES dbo.Venue (TenantId, VenueId),
    CONSTRAINT FK_NavCorrection_Level FOREIGN KEY (TenantId, LevelId) REFERENCES dbo.Level (TenantId, LevelId)
);
CREATE INDEX IX_NavCorrection_Level ON dbo.NavCorrection (TenantId, VenueId, LevelId);  -- serves: graph generation at publish
GO

/* ---------------------------------------------------------------------
   5. Published versions (invariant 3, Frozen Package rule)
   --------------------------------------------------------------------- */
CREATE TABLE dbo.VenueVersion (
    VenueVersionId       INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_VenueVersion PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    VersionNo            INT                NOT NULL,
    Status               NVARCHAR(12)       NOT NULL CONSTRAINT CK_VenueVersion_Status
                             CHECK (Status IN (N'BUILDING', N'PUBLISHED', N'FAILED')),  -- constants file; closed: the publish state machine in code
    PackageFileId        BIGINT             NULL,      -- the tenant's own file (composite FK below)
    PackageSha256        CHAR(64)           NULL,
    PackageFormatVersion INT                NOT NULL,  -- §8.5 companion-file sync table
    NodeCount            INT                NULL,
    EdgeCount            INT                NULL,
    PublishedAt          DATETIME2(3)       NULL,
    PublishedBy          INT                NULL,      -- must hold venue.publish (Venue Editor cannot, L41)
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_VenueVersion_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT                NULL,
    UpdatedAt            DATETIME2(3)       NULL,
    CONSTRAINT FK_VenueVersion_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES dbo.Venue (TenantId, VenueId),
    CONSTRAINT FK_VenueVersion_File FOREIGN KEY (TenantId, PackageFileId) REFERENCES dbo.StoredFile (TenantId, FileId),
    CONSTRAINT UQ_VenueVersion UNIQUE (TenantId, VenueId, VersionNo),  -- serves: next version number per venue
    CONSTRAINT UQ_VenueVersion_Tenant_Ver UNIQUE (TenantId, VenueVersionId),
    CONSTRAINT CK_VenueVersion_Published CHECK (Status <> N'PUBLISHED' OR (PackageFileId IS NOT NULL AND PackageSha256 IS NOT NULL AND PublishedAt IS NOT NULL))
);
CREATE INDEX IX_VenueVersion_Latest ON dbo.VenueVersion (TenantId, VenueId, Status, VersionNo DESC);  -- serves: public "latest published" + ETag
GO
-- Frozen Package rule, database layer: a PUBLISHED row is never updated or deleted.
CREATE TRIGGER dbo.TR_VenueVersion_Frozen ON dbo.VenueVersion AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted WHERE Status = N'PUBLISHED')
        THROW 51000, N'Frozen Package: a published venue version is never updated or deleted.', 1;
END;
GO

/* ---------------------------------------------------------------------
   6. Beacons, sentinels, planner (invariants 7-9; D9 pending; L40)
   --------------------------------------------------------------------- */
CREATE TABLE dbo.BeaconPlan (
    BeaconPlanId         INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_BeaconPlan PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    LevelId              INT                NOT NULL,
    PlanKind             NVARCHAR(20)       NOT NULL CONSTRAINT CK_BeaconPlan_Kind
                             CHECK (PlanKind IN (N'MIN_PROXIMITY', N'RECOMMENDED', N'BUDGET_CAP')),  -- L40; constants file; closed: each kind is a planner algorithm in code
    Status               NVARCHAR(12)       NOT NULL CONSTRAINT CK_BeaconPlan_Status
                             CHECK (Status IN (N'PROPOSED', N'SELECTED', N'SUPERSEDED')),  -- L40; constants file; closed: the plan workflow in code
    BudgetCap            DECIMAL(18,4)      NULL,      -- money (standard rule 1)
    BeaconCount          INT                NOT NULL,
    EstimatedCost        DECIMAL(18,4)      NULL,
    P95Gdop              DECIMAL(9,3)       NULL,
    CoveragePct          DECIMAL(5,2)       NULL,
    InputsJson           NVARCHAR(MAX)      NOT NULL CONSTRAINT CK_BeaconPlan_Inputs CHECK (ISJSON(InputsJson) = 1),  -- k values, RSSI params, prices
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_BeaconPlan_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT                NULL,
    UpdatedAt            DATETIME2(3)       NULL,
    CONSTRAINT FK_BeaconPlan_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES dbo.Venue (TenantId, VenueId),
    CONSTRAINT FK_BeaconPlan_Level FOREIGN KEY (TenantId, LevelId) REFERENCES dbo.Level (TenantId, LevelId),
    CONSTRAINT UQ_BeaconPlan_Tenant_Plan UNIQUE (TenantId, BeaconPlanId)
);
CREATE INDEX IX_BeaconPlan_Level ON dbo.BeaconPlan (TenantId, VenueId, LevelId, Status);  -- serves: the planner's plan list per floor
GO

CREATE TABLE dbo.BeaconPlanItem (
    BeaconPlanItemId     INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_BeaconPlanItem PRIMARY KEY,
    TenantId             INT                NOT NULL,
    BeaconPlanId         INT                NOT NULL,
    X DECIMAL(9,3) NOT NULL, Y DECIMAL(9,3) NOT NULL,
    MountHeightM         DECIMAL(5,2)       NOT NULL,  -- L45: the highest point available; on the ceiling where it is below 3 m
    PlacementReason      NVARCHAR(20)       NOT NULL CONSTRAINT CK_BeaconPlanItem_Reason
                             CHECK (PlacementReason IN (N'CONNECTOR', N'ENTRANCE', N'COVERAGE', N'GEOMETRY')),  -- L40; constants file; closed: written by the planner algorithm, not by people
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_BeaconPlanItem_CreatedAt DEFAULT SYSUTCDATETIME(),
    -- No VenueId: always loaded through its BeaconPlan, which carries it (Blueprint invariant 13, child-row note).
    CONSTRAINT FK_BeaconPlanItem_Plan FOREIGN KEY (TenantId, BeaconPlanId) REFERENCES dbo.BeaconPlan (TenantId, BeaconPlanId),
    CONSTRAINT UQ_BeaconPlanItem_Tenant_Item UNIQUE (TenantId, BeaconPlanItemId)  -- composite-FK target for Beacon
);
CREATE INDEX IX_BeaconPlanItem_Plan ON dbo.BeaconPlanItem (TenantId, BeaconPlanId);  -- serves: plan load with its items
GO

CREATE TABLE dbo.Beacon (
    BeaconId             BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Beacon PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    LevelId              INT                NOT NULL,
    X DECIMAL(9,3) NOT NULL, Y DECIMAL(9,3) NOT NULL,
    MountHeightM         DECIMAL(5,2)       NULL,
    ProximityUuid        UNIQUEIDENTIFIER   NOT NULL,
    Major                INT                NOT NULL CONSTRAINT CK_Beacon_Major CHECK (Major BETWEEN 0 AND 65535),
    Minor                INT                NOT NULL CONSTRAINT CK_Beacon_Minor CHECK (Minor BETWEEN 0 AND 65535),
    IdentityScheme       NVARCHAR(20)       NOT NULL CONSTRAINT CK_Beacon_Scheme
                             CHECK (IdentityScheme IN (N'IBEACON_STATIC')),  -- D9 pending; constants file; closed: each scheme is decoding code; widen by migration
    MeasuredPower        SMALLINT           NULL,
    BeaconModelId        INT                NULL CONSTRAINT FK_Beacon_Model REFERENCES dbo.BeaconModel (BeaconModelId),  -- lookup: single-column by design (header)
    BeaconPlanItemId     INT                NULL,      -- composite FK below
    InstalledOn          DATE               NULL,
    BatteryServicedOn    DATE               NULL,
    IsActive             BIT                NOT NULL CONSTRAINT DF_Beacon_IsActive DEFAULT 1,
    -- Deliberately excluded: key material (keyed schemes get a separate encrypted table) and
    -- any per-shopper sighting (invariant 4).
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_Beacon_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT                NULL,
    UpdatedAt            DATETIME2(3)       NULL,
    CONSTRAINT FK_Beacon_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES dbo.Venue (TenantId, VenueId),
    CONSTRAINT FK_Beacon_Level FOREIGN KEY (TenantId, LevelId) REFERENCES dbo.Level (TenantId, LevelId),
    CONSTRAINT FK_Beacon_Namespace FOREIGN KEY (TenantId, ProximityUuid) REFERENCES dbo.Tenant (TenantId, BeaconProximityUuid),
    CONSTRAINT FK_Beacon_PlanItem FOREIGN KEY (TenantId, BeaconPlanItemId) REFERENCES dbo.BeaconPlanItem (TenantId, BeaconPlanItemId),
    CONSTRAINT UQ_Beacon_Identity UNIQUE (ProximityUuid, Major, Minor),  -- serves: publish-time collision check (invariant 9)
    CONSTRAINT UQ_Beacon_Tenant_Beacon UNIQUE (TenantId, BeaconId)       -- composite-FK target for the sentinel readings
);
CREATE INDEX IX_Beacon_Level ON dbo.Beacon (TenantId, VenueId, LevelId, IsActive);  -- serves: editor load, package build
GO

CREATE TABLE dbo.Sentinel (
    SentinelId           INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_Sentinel PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    LevelId              INT                NOT NULL,
    Name                 NVARCHAR(100)      NOT NULL,
    X DECIMAL(9,3) NOT NULL, Y DECIMAL(9,3) NOT NULL,
    HmacSecretEnc        VARBINARY(256)     NOT NULL,  -- ENCRYPTED AT REST; §3.17 ingest
    IsActive             BIT                NOT NULL CONSTRAINT DF_Sentinel_IsActive DEFAULT 1,
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_Sentinel_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT                NULL,
    UpdatedAt            DATETIME2(3)       NULL,
    CONSTRAINT FK_Sentinel_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES dbo.Venue (TenantId, VenueId),
    CONSTRAINT FK_Sentinel_Level FOREIGN KEY (TenantId, LevelId) REFERENCES dbo.Level (TenantId, LevelId),
    CONSTRAINT UQ_Sentinel_Tenant_Sentinel UNIQUE (TenantId, SentinelId)
);
CREATE INDEX IX_Sentinel_Venue ON dbo.Sentinel (TenantId, VenueId, IsActive);  -- serves: beacon-health view per venue
GO

-- High volume (~5.3M rows / venue / year at 20 sentinels x 30 beacons). Not audit-stamped per row (§3.6 noise filter).
-- Retention: hourly rows 90 days, then rolled into SentinelReadingDaily (25 months).
CREATE TABLE dbo.SentinelReadingHourly (
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,  -- 0.2: invariant 13; health queries run by venue and time
    SentinelId           INT                NOT NULL,
    BeaconId             BIGINT             NOT NULL,
    HourStart            DATETIME2(0)       NOT NULL,
    MedianRssi           SMALLINT           NOT NULL,
    SampleCount          INT                NOT NULL,
    CONSTRAINT PK_SentinelReadingHourly PRIMARY KEY (SentinelId, BeaconId, HourStart),  -- serves: ingest upsert per sentinel, beacon and hour
    CONSTRAINT FK_SRH_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES dbo.Venue (TenantId, VenueId),
    CONSTRAINT FK_SRH_Sentinel FOREIGN KEY (TenantId, SentinelId) REFERENCES dbo.Sentinel (TenantId, SentinelId),
    CONSTRAINT FK_SRH_Beacon FOREIGN KEY (TenantId, BeaconId) REFERENCES dbo.Beacon (TenantId, BeaconId)
);
CREATE INDEX IX_SRH_Venue ON dbo.SentinelReadingHourly (TenantId, VenueId, HourStart);  -- serves: beacon-health trend by venue; the 90-day roll-up
GO

CREATE TABLE dbo.SentinelReadingDaily (
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,  -- 0.2: invariant 13
    SentinelId           INT                NOT NULL,
    BeaconId             BIGINT             NOT NULL,
    DayStart             DATE               NOT NULL,
    MedianRssi           SMALLINT           NOT NULL,
    SampleCount          INT                NOT NULL,
    CONSTRAINT PK_SentinelReadingDaily PRIMARY KEY (SentinelId, BeaconId, DayStart),  -- serves: roll-up upsert
    CONSTRAINT FK_SRD_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES dbo.Venue (TenantId, VenueId),
    CONSTRAINT FK_SRD_Sentinel FOREIGN KEY (TenantId, SentinelId) REFERENCES dbo.Sentinel (TenantId, SentinelId),
    CONSTRAINT FK_SRD_Beacon FOREIGN KEY (TenantId, BeaconId) REFERENCES dbo.Beacon (TenantId, BeaconId)
);
CREATE INDEX IX_SRD_Venue ON dbo.SentinelReadingDaily (TenantId, VenueId, DayStart);  -- serves: 25-month beacon-health trend by venue
GO

/* ---------------------------------------------------------------------
   7. Live venue status overlay (L28, P1) — separate from the frozen package
   --------------------------------------------------------------------- */
CREATE TABLE dbo.Closure (
    ClosureId            INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_Closure PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    LevelId              INT                NULL,
    NavConnectorId       INT                NULL,      -- out-of-service escalator/lift
    AreaGeoJson          NVARCHAR(MAX)      NULL CONSTRAINT CK_Closure_Area CHECK (AreaGeoJson IS NULL OR ISJSON(AreaGeoJson) = 1),
    Reason               NVARCHAR(200)      NOT NULL,
    StartsAt             DATETIME2(3)       NOT NULL,
    EndsAt               DATETIME2(3)       NULL,
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_Closure_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT                NULL,
    UpdatedAt            DATETIME2(3)       NULL,
    CONSTRAINT FK_Closure_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES dbo.Venue (TenantId, VenueId),
    CONSTRAINT FK_Closure_Level FOREIGN KEY (TenantId, LevelId) REFERENCES dbo.Level (TenantId, LevelId),
    CONSTRAINT FK_Closure_Conn FOREIGN KEY (TenantId, NavConnectorId) REFERENCES dbo.NavConnector (TenantId, NavConnectorId),
    CONSTRAINT CK_Closure_Target CHECK (NavConnectorId IS NOT NULL OR AreaGeoJson IS NOT NULL)
);
CREATE INDEX IX_Closure_Active ON dbo.Closure (TenantId, VenueId, EndsAt);  -- serves: public live-status read
GO

/* ---------------------------------------------------------------------
   8. Shoppers and consented analytics (D1; L42 legal gate)
   --------------------------------------------------------------------- */
CREATE TABLE dbo.ShopperAccount (
    ShopperAccountId     INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_ShopperAccount PRIMARY KEY,
    -- Platform-scoped on purpose: one shopper uses many malls (tenants). Separate from AppUser (D1).
    Email                NVARCHAR(254)      NULL,
    EmailVerifiedAt      DATETIME2(3)       NULL,
    PasswordHash         NVARCHAR(100)      NULL,      -- set only if D1b chooses email + password
    AuthProvider         NVARCHAR(20)       NULL,      -- set only if D1b adds social sign-in
    ProviderSubject      NVARCHAR(200)      NULL,
    DisplayName          NVARCHAR(120)      NULL,
    DeletionRequestedAt  DATETIME2(3)       NULL,      -- Apple / Google Play deletion paths
    -- Deliberately excluded: any position, route, or saved parking spot (kept on device; invariant 4, L30).
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_ShopperAccount_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt            DATETIME2(3)       NULL
);
CREATE UNIQUE INDEX UX_ShopperAccount_Email ON dbo.ShopperAccount (Email) WHERE Email IS NOT NULL;  -- serves: sign-in lookup; one account per email
GO

CREATE TABLE dbo.AnalyticsConsent (
    AnalyticsConsentId   BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AnalyticsConsent PRIMARY KEY,
    PseudonymId          UNIQUEIDENTIFIER   NOT NULL,  -- device-generated; rotated on withdrawal
    ConsentTextVersion   NVARCHAR(20)       NOT NULL,  -- which just-in-time notice was shown (NPC 2023-04)
    GrantedAt            DATETIME2(3)       NOT NULL,
    WithdrawnAt          DATETIME2(3)       NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_AnalyticsConsent_CreatedAt DEFAULT SYSUTCDATETIME()
);
CREATE UNIQUE INDEX UX_AnalyticsConsent_Pseudonym ON dbo.AnalyticsConsent (PseudonymId);  -- serves: consent check on each trace write; FK target
GO

-- L42: NO WRITES until the legal gate (DPO, counsel, NPC registration check) clears.
-- Retention (proposal for DPO): 13 months, then deleted. Not audit-stamped per row.
CREATE TABLE dbo.RouteTrace (
    RouteTraceId         BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_RouteTrace PRIMARY KEY,
    TenantId             INT                NOT NULL,
    VenueId              INT                NOT NULL,
    VenueVersionId       INT                NOT NULL,
    PseudonymId          UNIQUEIDENTIFIER   NOT NULL CONSTRAINT FK_RouteTrace_Consent REFERENCES dbo.AnalyticsConsent (PseudonymId),
    StartedAt            DATETIME2(0)       NOT NULL,
    EndedAt              DATETIME2(0)       NULL,
    DestinationUnitId    INT                NULL,
    TraceGeoJson         NVARCHAR(MAX)      NOT NULL CONSTRAINT CK_RouteTrace_Trace CHECK (ISJSON(TraceGeoJson) = 1),
    PointCount           INT                NOT NULL,
    CONSTRAINT FK_RouteTrace_Venue FOREIGN KEY (TenantId, VenueId) REFERENCES dbo.Venue (TenantId, VenueId),
    CONSTRAINT FK_RouteTrace_Version FOREIGN KEY (TenantId, VenueVersionId) REFERENCES dbo.VenueVersion (TenantId, VenueVersionId),
    CONSTRAINT FK_RouteTrace_Destination FOREIGN KEY (TenantId, DestinationUnitId) REFERENCES dbo.Unit (TenantId, UnitId)
);
CREATE INDEX IX_RouteTrace_Venue ON dbo.RouteTrace (TenantId, VenueId, StartedAt);  -- serves: KPI aggregation by period
GO

/* ---------------------------------------------------------------------
   9. Audit trail (standard §3.6) and app versions (§4.8)
   --------------------------------------------------------------------- */
-- Retention (proposal): 24 months online, then archived. About 4 KB per mutating request.
-- Row shape per standard §3.6: UserId, IPAddress, Route, Method, PayloadDiff. Written on res.on('finish'),
-- secrets redacted (redactSecrets) before serialisation, fire-and-forget.
CREATE TABLE dbo.AuditLog (
    AuditLogId           BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AuditLog PRIMARY KEY,
    TenantId             INT                NULL,
    UserId               INT                NULL,      -- set only after a password matches on the login route (§3.3)
    ActingAsTenantId     INT                NULL,      -- SuperAdmin "act as mall admin" (L41), always recorded
    IPAddress            NVARCHAR(45)       NULL,      -- ::ffff: normalised; 45 = longest IPv6 text form
    Method               NVARCHAR(10)       NOT NULL,
    Route                NVARCHAR(400)      NOT NULL,  -- capped to the column width
    EntityName           NVARCHAR(80)       NULL,
    EntityId             NVARCHAR(40)       NULL,
    PayloadDiff          NVARCHAR(4000)     NULL,      -- {body,query,params,status}, capped about 4 KB with a truncation marker (so not always valid JSON)
    StatusCode           SMALLINT           NOT NULL,
    RequestId            NVARCHAR(40)       NOT NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_AuditLog_CreatedAt DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_AuditLog_Tenant ON dbo.AuditLog (TenantId, CreatedAt DESC);  -- serves: audit viewer, newest first
GO

CREATE TABLE dbo.AppVersion (
    AppVersionId         INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_AppVersion PRIMARY KEY,
    Surface              NVARCHAR(10)       NOT NULL CONSTRAINT CK_AppVersion_Surface CHECK (Surface IN (N'MOBILE', N'WEB')),  -- constants file; closed: the two release streams in the build pipeline
    Version              NVARCHAR(20)       NOT NULL,
    ReleasedAt           DATETIME2(3)       NOT NULL,
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_AppVersion_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_AppVersion UNIQUE (Surface, Version)  -- serves: version check per surface; one row per release
);
GO

CREATE TABLE dbo.ChangelogEntry (
    ChangelogEntryId     INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_ChangelogEntry PRIMARY KEY,
    AppVersionId         INT                NOT NULL CONSTRAINT FK_ChangelogEntry_Version REFERENCES dbo.AppVersion (AppVersionId),
    SortOrder            INT                NOT NULL,
    Text                 NVARCHAR(400)      NOT NULL,
    CreatedBy            INT                NULL,
    CreatedAt            DATETIME2(3)       NOT NULL CONSTRAINT DF_ChangelogEntry_CreatedAt DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_ChangelogEntry_Version ON dbo.ChangelogEntry (AppVersionId, SortOrder);  -- serves: "what's new" for one release
GO
