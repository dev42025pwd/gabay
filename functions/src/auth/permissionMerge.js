// The permission merge (standard §3.4 layer 2; db/schema.sql comments on RolePermission and UserPermission).
// Pure functions: no database, no request. S3's guard calls the same merge, so the screen and the server can never
// disagree ("the identical merge runs at sign-in and in the guard").
//
//   - the role rows of every role the user holds are OR-ed per route;
//   - a UserPermission row REPLACES the merged role row for its route (it may take rights away);
//   - a route with no row at all is absent from the result, which means "not granted".
//
// The result map has NO prototype (Object.create(null)): "constructor" or "toString" are not routes, so a lookup by a
// route name needs no Object.hasOwn guard. A UserPermission override has no tenant column, so it applies in EVERY
// tenant the user belongs to; S6 and S7 enforce who may write one (owner's ruling: only SUPERADMIN, or an admin who is
// MALL_ADMIN in every tenant that user belongs to).
'use strict';

/** The platform-wide super user (L41). Q8: the only role that bypasses permission rows. */
const SUPERADMIN_ROLE_CODE = 'SUPERADMIN';

const flagsOf = (row) => ({
  create: row.canCreate === true,
  read: row.canRead === true,
  update: row.canUpdate === true,
  delete: row.canDelete === true,
});

/**
 * @param {{roleIds: number[], rolePermissions: object[], userPermissions: object[]}} input
 *   rolePermissions: { roleId, routeKey, canCreate, canRead, canUpdate, canDelete }
 *   userPermissions: { routeKey, canCreate, canRead, canUpdate, canDelete }
 * @returns {Record<string, {create: boolean, read: boolean, update: boolean, delete: boolean}>}
 */
function mergeRoutePermissions({ roleIds, rolePermissions, userPermissions }) {
  const held = new Set(roleIds);
  const merged = new Map();
  for (const row of rolePermissions) {
    if (!held.has(row.roleId)) continue;
    const add = flagsOf(row);
    const have = merged.get(row.routeKey);
    merged.set(
      row.routeKey,
      have
        ? {
            create: have.create || add.create,
            read: have.read || add.read,
            update: have.update || add.update,
            delete: have.delete || add.delete,
          }
        : add,
    );
  }
  for (const row of userPermissions) merged.set(row.routeKey, flagsOf(row)); // replaces, never ORs
  const out = Object.create(null); // no prototype: "__proto__" is an ordinary own key too
  for (const [routeKey, flags] of merged) out[routeKey] = flags;
  return out;
}

/**
 * What GET /api/me returns about access: the tenants (the user's UserRole rows, L121) each with its roles and merged
 * permissions, the platform roles, and the SUPERADMIN flag. Platform roles (UserRole.TenantId NULL) apply inside
 * every tenant. User overrides carry no tenant, so they apply in every tenant too.
 *
 * A role is a platform role only when its UserRole row has no tenant AND the role is flagged IsPlatformRole; SUPERADMIN
 * needs both, plus the code (owner's ruling I2). A NULL-tenant row for any other role is bad data: it is ignored (it
 * grants nothing, anywhere) and reported through `warn`, with ids only.
 *
 * @param {{user: object, roles: object[], rolePermissions: object[], userPermissions: object[],
 *   warn?: (fields: object, message: string) => void}} input
 *   roles: { roleId, roleCode, isPlatformRole, tenantId (null = platform), tenantCode, tenantName, tenantIsActive }
 */
function buildAccessProfile({ user, roles, rolePermissions, userPermissions, warn = () => {} }) {
  const platformRoles = [];
  const byTenant = new Map();
  for (const r of roles) {
    if (r.tenantId === null) {
      if (r.isPlatformRole === true) platformRoles.push(r);
      else {
        warn(
          { userId: user.userId, roleId: r.roleId, roleCode: r.roleCode },
          'a NULL-tenant UserRole row holds a role that is not a platform role: ignored',
        );
      }
      continue;
    }
    if (!byTenant.has(r.tenantId)) byTenant.set(r.tenantId, []);
    byTenant.get(r.tenantId).push(r);
  }
  const tenants = [...byTenant].map(([tenantId, tenantRoles]) => {
    const applicable = [...platformRoles, ...tenantRoles];
    return {
      tenantId,
      code: tenantRoles[0].tenantCode,
      name: tenantRoles[0].tenantName,
      isActive: tenantRoles[0].tenantIsActive,
      roles: [...new Set(tenantRoles.map((r) => r.roleCode))],
      permissions: mergeRoutePermissions({
        roleIds: applicable.map((r) => r.roleId),
        rolePermissions,
        userPermissions,
      }),
    };
  });
  return {
    user: { userId: user.userId, email: user.email, displayName: user.displayName },
    // Platform rows only (NULL tenant and IsPlatformRole): a SUPERADMIN bound to a tenant, or not flagged platform, is
    // bad data and must not bypass anything.
    isSuperAdmin: platformRoles.some((r) => r.roleCode === SUPERADMIN_ROLE_CODE),
    platformRoles: [...new Set(platformRoles.map((r) => r.roleCode))],
    tenants,
  };
}

module.exports = { mergeRoutePermissions, buildAccessProfile, SUPERADMIN_ROLE_CODE };
