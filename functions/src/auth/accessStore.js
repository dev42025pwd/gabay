// The rows behind a user's access (standard §3.4; schema 0.14): their UserRole rows (which are their tenants, L121),
// the permission rows of those roles, and their own per-route overrides. permissionMerge.js turns them into the answer.
'use strict';

/** @param {{query: (text: string, params: any[]) => Promise<{rows: any[]}>}} db */
function createAccessStore(db) {
  return {
    /**
     * @param {number} userId  the verified user's id (from req.user, resolved from the token's UID, never a tenant)
     * @returns {Promise<{roles: object[], rolePermissions: object[], userPermissions: object[]}>} the shapes
     *   buildAccessProfile (permissionMerge.js) takes. Only active roles count. Database errors propagate.
     */
    async loadForUser(userId) {
      // A user's tenants ARE their UserRole rows (L121). This reads them by UserId, before any tenant has been
      // chosen for a request (tenantContext, S2, checks the chosen tenant against these same rows).
      const roles = await db.query(
        // tenant-scope: reads the user's own UserRole rows by UserId; a user's tenants are those rows (L121), no tenant is chosen yet
        `SELECT ur.RoleId, r.Code AS RoleCode, r.IsPlatformRole, ur.TenantId,
                t.Code AS TenantCode, t.Name AS TenantName, t.IsActive AS TenantIsActive
           FROM gabay.UserRole ur
           JOIN gabay.Role r ON r.RoleId = ur.RoleId
           LEFT JOIN gabay.Tenant t ON t.TenantId = ur.TenantId
          WHERE ur.UserId = $1
            AND r.IsActive
          ORDER BY ur.TenantId NULLS FIRST, r.Code`,
        [userId],
      );
      const roleRows = roles.rows.map((row) => ({
        roleId: row.roleid,
        roleCode: row.rolecode,
        isPlatformRole: row.isplatformrole,
        tenantId: row.tenantid,
        tenantCode: row.tenantcode,
        tenantName: row.tenantname,
        tenantIsActive: row.tenantisactive,
      }));

      const roleIds = [...new Set(roleRows.map((r) => r.roleId))];
      const rolePermissions =
        roleIds.length === 0
          ? { rows: [] }
          : await db.query(
              `SELECT rp.RoleId, pr.RouteKey, rp.CanCreate, rp.CanRead, rp.CanUpdate, rp.CanDelete
                 FROM gabay.RolePermission rp
                 JOIN gabay.PermissionRoute pr ON pr.PermissionRouteId = rp.PermissionRouteId
                WHERE rp.RoleId = ANY($1::int[])`,
              [roleIds],
            );

      const userPermissions = await db.query(
        `SELECT pr.RouteKey, up.CanCreate, up.CanRead, up.CanUpdate, up.CanDelete
           FROM gabay.UserPermission up
           JOIN gabay.PermissionRoute pr ON pr.PermissionRouteId = up.PermissionRouteId
          WHERE up.UserId = $1`,
        [userId],
      );

      return {
        roles: roleRows,
        rolePermissions: rolePermissions.rows.map((row) => ({
          roleId: row.roleid,
          routeKey: row.routekey,
          canCreate: row.cancreate,
          canRead: row.canread,
          canUpdate: row.canupdate,
          canDelete: row.candelete,
        })),
        userPermissions: userPermissions.rows.map((row) => ({
          routeKey: row.routekey,
          canCreate: row.cancreate,
          canRead: row.canread,
          canUpdate: row.canupdate,
          canDelete: row.candelete,
        })),
      };
    },
  };
}

module.exports = { createAccessStore };
