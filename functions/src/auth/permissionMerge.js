// The permission merge (standard §3.4 layer 2; db/schema.sql comments on RolePermission and UserPermission).
// Pure functions: no database, no request. S3's guard calls the same merge, so the screen and the server can never
// disagree ("the identical merge runs at sign-in and in the guard").
//
//   - the role rows of every role the user holds are OR-ed per route;
//   - a UserPermission row REPLACES the merged role row for its route (it may take rights away);
//   - a route with no row at all is absent from the result, which means "not granted".
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
  return Object.fromEntries(merged); // fromEntries makes "__proto__" an ordinary own key
}

/**
 * What GET /api/me returns about access: the tenants (the user's UserRole rows, L121) each with its roles and merged
 * permissions, the platform roles, and the SUPERADMIN flag. Platform roles (UserRole.TenantId NULL) apply inside
 * every tenant. User overrides carry no tenant, so they apply in every tenant too.
 *
 * @param {{user: object, roles: object[], rolePermissions: object[], userPermissions: object[]}} input
 *   roles: { roleId, roleCode, tenantId (null = platform), tenantCode, tenantName, tenantIsActive }
 */
function buildAccessProfile({ user, roles, rolePermissions, userPermissions }) {
  const platformRoles = roles.filter((r) => r.tenantId === null);
  const byTenant = new Map();
  for (const r of roles) {
    if (r.tenantId === null) continue;
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
    // Platform rows only: a SUPERADMIN role bound to a tenant is bad data and must not bypass anything.
    isSuperAdmin: platformRoles.some((r) => r.roleCode === SUPERADMIN_ROLE_CODE),
    platformRoles: [...new Set(platformRoles.map((r) => r.roleCode))],
    tenants,
  };
}

module.exports = { mergeRoutePermissions, buildAccessProfile, SUPERADMIN_ROLE_CODE };
