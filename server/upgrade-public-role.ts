import type pg from "pg";

// Upgrade account/profile checks without changing existing rows, keys or passwords.
// Legacy bank accounts may remain unlinked; access is empty until an admin links them.
// Add and validate the replacement guards before removing the legacy guards.
export async function upgradePublicRole(pool: pg.Pool) {
  await pool.query(`ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS users_role_allowed
    CHECK (role IN ('administrator','owner','survey_officer','valuation_officer','sub_registrar','bank_verifier','auditor','public_viewer'))`);
  await pool.query(`ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS users_role_profile_next
    CHECK ((role = 'owner' AND owner_id IS NOT NULL AND officer_id IS NULL)
    OR (role IN ('survey_officer','valuation_officer','sub_registrar','auditor') AND officer_id IS NOT NULL AND owner_id IS NULL)
    OR (role = 'bank_verifier' AND owner_id IS NULL)
    OR (role IN ('administrator','public_viewer') AND owner_id IS NULL AND officer_id IS NULL))`);
  await pool.query(
    "ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_profile",
  );
  await pool.query(`ALTER TABLE users ADD CONSTRAINT users_role_profile
    CHECK ((role = 'owner' AND owner_id IS NOT NULL AND officer_id IS NULL)
    OR (role IN ('survey_officer','valuation_officer','sub_registrar','auditor') AND officer_id IS NOT NULL AND owner_id IS NULL)
    OR (role = 'bank_verifier' AND owner_id IS NULL)
    OR (role IN ('administrator','public_viewer') AND owner_id IS NULL AND officer_id IS NULL))`);
  await pool.query(
    "ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_profile_next",
  );
  await pool.query(`ALTER TABLE officers ADD CONSTRAINT IF NOT EXISTS officers_designation_allowed
    CHECK (designation IN ('survey_officer','valuation_officer','sub_registrar','auditor','bank_verifier'))`);
  await pool.query(
    "ALTER TABLE officers DROP CONSTRAINT IF EXISTS check_designation",
  );
  // These are CockroachDB's generated names in the previously approved schema.
  // Each DDL statement commits separately; rerunning after an interruption is safe.
  await pool.query("ALTER TABLE users DROP CONSTRAINT IF EXISTS check_role");
  await pool.query(
    "ALTER TABLE users DROP CONSTRAINT IF EXISTS check_role_owner_id_officer_id_role_officer_id_owner_id_role_owner_id_officer_id",
  );
}
