import type pg from "pg";

// Widen the two approved account checks without altering rows, keys or tables.
// Add and validate the replacement guards before removing the legacy guards.
export async function upgradePublicRole(pool: pg.Pool) {
  await pool.query(`ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS users_role_allowed
    CHECK (role IN ('administrator','owner','survey_officer','valuation_officer','sub_registrar','bank_verifier','auditor','public_viewer'))`);
  await pool.query(`ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS users_role_profile
    CHECK ((role = 'owner' AND owner_id IS NOT NULL AND officer_id IS NULL)
    OR (role IN ('survey_officer','valuation_officer','sub_registrar','auditor') AND officer_id IS NOT NULL AND owner_id IS NULL)
    OR (role IN ('administrator','bank_verifier','public_viewer') AND owner_id IS NULL AND officer_id IS NULL))`);
  // These are CockroachDB's generated names in the previously approved schema.
  // Each DDL statement commits separately; rerunning after an interruption is safe.
  await pool.query("ALTER TABLE users DROP CONSTRAINT IF EXISTS check_role");
  await pool.query(
    "ALTER TABLE users DROP CONSTRAINT IF EXISTS check_role_owner_id_officer_id_role_officer_id_owner_id_role_owner_id_officer_id",
  );
}
