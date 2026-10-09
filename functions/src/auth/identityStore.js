// UID -> account (E-08; plan/PH2-identity.md Q12). The Firebase UID in a verified token names either an AppUser (an
// admin) or a ShopperAccount (a shopper). Both columns are UNIQUE, so each lookup returns at most one row.
//
// AppUser and ShopperAccount have no TenantId (schema 0.14: a user's tenants are their UserRole rows, L121; shoppers
// are platform-scoped), so these queries carry no tenant predicate and the tenant-predicate lint has nothing to check.
'use strict';

// DESIGN CHOICE (for the product owner to rule): when a UID is in AppUser, that wins and ShopperAccount is not
// consulted. The UID is unique within each table, but Firebase could in principle issue one person both kinds of
// account; AppUser first means a staff identity is never downgraded to a shopper one. Alternative: refuse the
// sign-in when both exist. ShopperAccount.DeletionRequestedAt (a shopper who asked for deletion) is not looked at
// here: it belongs to the shopper sign-in and deletion path of P0-10.

/** Longest Firebase UID (the SDK itself refuses longer; db/schema.sql: VARCHAR(128)). */
const MAX_UID_LENGTH = 128;

/** @param {{query: (text: string, params: any[]) => Promise<{rows: any[]}>}} db */
function createIdentityStore(db) {
  return {
    /**
     * @returns {Promise<
     *   {kind: 'admin', userId: number, email: string, displayName: string, isActive: boolean}
     *   | {kind: 'shopper', shopperAccountId: number, email: string|null, displayName: string|null}
     *   | null>}
     * Database errors propagate (the error handler maps them to 503 or 500).
     */
    async findByFirebaseUid(uid) {
      if (typeof uid !== 'string' || uid.length === 0 || uid.length > MAX_UID_LENGTH) return null;

      const admin = await db.query(
        `SELECT UserId, Email, DisplayName, IsActive
           FROM gabay.AppUser
          WHERE FirebaseUid = $1`,
        [uid],
      );
      if (admin.rows.length > 0) {
        const row = admin.rows[0];
        return {
          kind: 'admin',
          userId: row.userid,
          email: row.email,
          displayName: row.displayname,
          isActive: row.isactive,
        };
      }

      const shopper = await db.query(
        `SELECT ShopperAccountId, Email, DisplayName
           FROM gabay.ShopperAccount
          WHERE FirebaseUid = $1`,
        [uid],
      );
      if (shopper.rows.length > 0) {
        const row = shopper.rows[0];
        return {
          kind: 'shopper',
          shopperAccountId: row.shopperaccountid,
          email: row.email,
          displayName: row.displayname,
        };
      }
      return null;
    },
  };
}

module.exports = { createIdentityStore, MAX_UID_LENGTH };
