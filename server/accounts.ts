import type pg from "pg";
import { demand } from "./errors.js";
import { uuidPattern } from "./validation.js";
const validateId = (id: unknown) =>
  demand(
    typeof id === "string" && uuidPattern.test(id),
    "Select a valid linked profile.",
  );

export async function accountLinks(
  client: pg.PoolClient,
  role: string,
  ownerId: unknown,
  officerId: unknown,
  existingId?: string,
) {
  const staff = [
    "survey_officer",
    "valuation_officer",
    "sub_registrar",
    "bank_verifier",
    "auditor",
  ].includes(role);
  const profileId = role === "owner" ? ownerId : staff ? officerId : null;
  if (profileId) validateId(profileId);
  if (role === "owner" || staff) {
    validateId(profileId);
    const profile = (
      await client.query(
        staff
          ? "SELECT id FROM officers WHERE id=$1 AND designation=$2 AND active=true FOR UPDATE"
          : "SELECT id FROM owners WHERE id=$1 FOR UPDATE",
        staff ? [profileId, role] : [profileId],
      )
    ).rows[0];
    demand(
      profile,
      "The linked profile must exist, be active and match the account role.",
    );
    const column = staff ? "officer_id" : "owner_id";
    demand(
      !(
        await client.query(
          `SELECT id FROM users WHERE ${column}=$1 AND active=true AND ($2::UUID IS NULL OR id!=$2) LIMIT 1`,
          [profileId, existingId ?? null],
        )
      ).rows.length,
      "This profile already has an active account.",
      409,
    );
  }
  return {
    owner_id: role === "owner" ? ownerId : null,
    officer_id: staff ? officerId : null,
  };
}
