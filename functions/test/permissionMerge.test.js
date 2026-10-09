'use strict';

// P2-S1: the permission merge behind GET /api/me (standard §3.4 layer 2; schema comments on
// RolePermission and UserPermission). Pure functions, so every rule is shown on plain data:
//   - role rows are OR-ed per route (a user may hold several roles);
//   - a UserPermission row REPLACES the merged role row for its route (even with fewer rights);
//   - a route with no row at all is left out (not granted);
//   - tenant roles and platform roles both apply inside a tenant; SUPERADMIN is a flag.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  mergeRoutePermissions,
  buildAccessProfile,
  SUPERADMIN_ROLE_CODE,
} = require('../src/auth/permissionMerge');

const rp = (roleId, routeKey, c, r, u, d) => ({
  roleId,
  routeKey,
  canCreate: c,
  canRead: r,
  canUpdate: u,
  canDelete: d,
});
const up = (routeKey, c, r, u, d) => ({
  routeKey,
  canCreate: c,
  canRead: r,
  canUpdate: u,
  canDelete: d,
});
const flags = (create, read, update, deleted) => ({ create, read, update, delete: deleted });

test('merge: role rows are OR-ed per route across the roles held', () => {
  const merged = mergeRoutePermissions({
    roleIds: [1, 2],
    rolePermissions: [
      rp(1, 'venues', false, true, false, false),
      rp(2, 'venues', true, false, false, false),
      rp(2, 'beacons', false, true, false, false),
    ],
    userPermissions: [],
  });
  assert.deepEqual(merged, {
    venues: flags(true, true, false, false),
    beacons: flags(false, true, false, false),
  });
});

test('merge: only the roles named count (another role id is ignored)', () => {
  const merged = mergeRoutePermissions({
    roleIds: [1],
    rolePermissions: [
      rp(1, 'venues', false, true, false, false),
      rp(9, 'venues', true, true, true, true),
    ],
    userPermissions: [],
  });
  assert.deepEqual(merged, { venues: flags(false, true, false, false) });
});

test('merge: a user row replaces the merged role row, it is not OR-ed with it', () => {
  const merged = mergeRoutePermissions({
    roleIds: [1],
    rolePermissions: [rp(1, 'venues', true, true, true, true)],
    userPermissions: [up('venues', false, true, false, false)],
  });
  assert.deepEqual(merged.venues, flags(false, true, false, false), 'rights were taken away');
});

test('merge: an all-false user row denies a route the role grants', () => {
  const merged = mergeRoutePermissions({
    roleIds: [1],
    rolePermissions: [rp(1, 'audit', false, true, false, false)],
    userPermissions: [up('audit', false, false, false, false)],
  });
  assert.deepEqual(merged.audit, flags(false, false, false, false));
});

test('merge: a user row can grant a route no role mentions', () => {
  const merged = mergeRoutePermissions({
    roleIds: [],
    rolePermissions: [],
    userPermissions: [up('settings', false, true, true, false)],
  });
  assert.deepEqual(merged, { settings: flags(false, true, true, false) });
});

test('merge: no rows at all is an empty object, and a route named __proto__ is an ordinary key', () => {
  const merged = mergeRoutePermissions({ roleIds: [], rolePermissions: [], userPermissions: [] });
  assert.deepEqual(merged, {});
  const odd = mergeRoutePermissions({
    roleIds: [1],
    rolePermissions: [rp(1, '__proto__', true, true, true, true)],
    userPermissions: [],
  });
  assert.equal(Object.getPrototypeOf(odd), Object.prototype, 'the prototype is not replaced');
  assert.deepEqual(Object.keys(odd), ['__proto__'], 'it is an ordinary own key');
});

const USER = { userId: 7, email: 'a@x.test', displayName: 'A' };
const role = (roleId, roleCode, tenantId, extra = {}) => ({
  roleId,
  roleCode,
  tenantId,
  tenantCode: tenantId === null ? null : `T${tenantId}`,
  tenantName: tenantId === null ? null : `Tenant ${tenantId}`,
  tenantIsActive: tenantId === null ? null : true,
  ...extra,
});

test('profile: tenants come from the UserRole rows, each with its own roles and merged permissions', () => {
  const profile = buildAccessProfile({
    user: USER,
    roles: [role(2, 'MALL_ADMIN', 1), role(3, 'VIEWER', 2)],
    rolePermissions: [
      rp(2, 'venues', true, true, true, true),
      rp(3, 'venues', false, true, false, false),
    ],
    userPermissions: [],
  });
  assert.equal(profile.isSuperAdmin, false);
  assert.deepEqual(profile.user, USER);
  assert.deepEqual(
    profile.tenants.map((t) => [t.tenantId, t.code, t.name, t.isActive, t.roles]),
    [
      [1, 'T1', 'Tenant 1', true, ['MALL_ADMIN']],
      [2, 'T2', 'Tenant 2', true, ['VIEWER']],
    ],
  );
  assert.deepEqual(profile.tenants[0].permissions.venues, flags(true, true, true, true));
  assert.deepEqual(profile.tenants[1].permissions.venues, flags(false, true, false, false));
  assert.deepEqual(profile.platformRoles, []);
});

test('profile: two roles in the same tenant are one tenant entry with OR-ed rights', () => {
  const profile = buildAccessProfile({
    user: USER,
    roles: [role(2, 'MALL_ADMIN', 1), role(3, 'VIEWER', 1)],
    rolePermissions: [
      rp(2, 'venues', true, false, false, false),
      rp(3, 'venues', false, true, false, false),
    ],
    userPermissions: [],
  });
  assert.equal(profile.tenants.length, 1);
  assert.deepEqual(profile.tenants[0].roles, ['MALL_ADMIN', 'VIEWER']);
  assert.deepEqual(profile.tenants[0].permissions.venues, flags(true, true, false, false));
});

test('profile: a user override applies in every tenant', () => {
  const profile = buildAccessProfile({
    user: USER,
    roles: [role(2, 'MALL_ADMIN', 1), role(2, 'MALL_ADMIN', 2)],
    rolePermissions: [rp(2, 'venues', true, true, true, true)],
    userPermissions: [up('venues', false, true, false, false)],
  });
  assert.equal(profile.tenants.length, 2);
  for (const t of profile.tenants) {
    assert.deepEqual(t.permissions.venues, flags(false, true, false, false));
  }
});

test('profile: SUPERADMIN on a platform row sets the flag and lists no tenant of its own', () => {
  const profile = buildAccessProfile({
    user: USER,
    roles: [role(1, SUPERADMIN_ROLE_CODE, null)],
    rolePermissions: [],
    userPermissions: [],
  });
  assert.equal(profile.isSuperAdmin, true);
  assert.deepEqual(profile.platformRoles, [SUPERADMIN_ROLE_CODE]);
  assert.deepEqual(profile.tenants, []);
});

test('profile: a SUPERADMIN role bound to a tenant (bad data) is listed but does not set the flag', () => {
  const profile = buildAccessProfile({
    user: USER,
    roles: [role(1, SUPERADMIN_ROLE_CODE, 1)],
    rolePermissions: [],
    userPermissions: [],
  });
  assert.equal(profile.isSuperAdmin, false);
  assert.deepEqual(profile.tenants[0].roles, [SUPERADMIN_ROLE_CODE]);
});

test('profile: platform role rows apply inside each tenant', () => {
  const profile = buildAccessProfile({
    user: USER,
    roles: [role(1, 'AUDITOR', null), role(3, 'VIEWER', 5)],
    rolePermissions: [
      rp(1, 'audit', false, true, false, false),
      rp(3, 'venues', false, true, false, false),
    ],
    userPermissions: [],
  });
  assert.deepEqual(profile.platformRoles, ['AUDITOR']);
  assert.deepEqual(profile.tenants[0].permissions, {
    audit: flags(false, true, false, false),
    venues: flags(false, true, false, false),
  });
});

test('profile: an inactive tenant is shown with isActive false (the client and tenantContext decide)', () => {
  const profile = buildAccessProfile({
    user: USER,
    roles: [role(2, 'MALL_ADMIN', 1, { tenantIsActive: false })],
    rolePermissions: [],
    userPermissions: [],
  });
  assert.equal(profile.tenants[0].isActive, false);
});

test('profile: a user with no roles has no tenants, no platform roles and is not SUPERADMIN', () => {
  const profile = buildAccessProfile({
    user: USER,
    roles: [],
    rolePermissions: [],
    userPermissions: [up('venues', true, true, true, true)],
  });
  assert.deepEqual(profile.tenants, []);
  assert.deepEqual(profile.platformRoles, []);
  assert.equal(profile.isSuperAdmin, false);
});
