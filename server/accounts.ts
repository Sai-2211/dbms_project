import type pg from "pg";
import { transaction } from "./db.js";
import { demand } from "./errors.js";
import { hashPassword } from "./auth.js";
import { insert, audit, validateRelations } from "./business.js";
import { resourceMap, type Actor } from "./resources.js";
import { validateRecord, uuidPattern } from "./validation.js";

export const staffRoles = [
  "survey_officer",
  "valuation_officer",
  "sub_registrar",
  "auditor",
  "bank_verifier",
];

export async function officerAccountDetails(
  db: pg.Pool | pg.PoolClient,
  rows: Record<string, any>[],
) {
  if (!rows.length) return rows;
  const accounts = (
    await db.query(
      "SELECT officer_id,username,active FROM users WHERE officer_id=ANY($1::UUID[]) ORDER BY created_at",
      [rows.map((r) => r.id)],
    )
  ).rows;
  return rows.map((row) => {
    const linked = accounts.filter((a) => a.officer_id === row.id);
    return {
      ...row,
      has_account: linked.some((a) => a.active),
      account_username: linked.length
        ? linked.map((a) => a.username).join(", ")
        : null,
      account_active: linked.length ? linked.some((a) => a.active) : null,
    };
  });
}

/** A new officer and login are committed together. Existing historical profiles can be linked once. */
export async function createAccount(actor: Actor, body: unknown) {
  demand(
    actor.role === "administrator",
    "Administrator access is required.",
    403,
  );
  demand(
    body && typeof body === "object" && !Array.isArray(body),
    "Enter account details.",
  );
  const input = body as Record<string, any>;
  demand(
    Object.keys(input).every((k) =>
      [
        "username",
        "password",
        "role",
        "owner_id",
        "officer_id",
        "officer",
      ].includes(k),
    ),
    "Unsupported account fields.",
  );
  const { password, role, owner_id } = input;
  const username =
    typeof input.username === "string"
      ? input.username.trim().toLowerCase()
      : "";
  demand(
    /^[a-z0-9@._+-]{3,100}$/.test(username),
    "Enter a valid username (3–100 letters, numbers or email characters).",
  );
  demand(
    typeof password === "string" &&
      password.trim().length >= 12 &&
      password.length <= 128,
    "Passwords must contain 12–128 characters.",
  );
  demand(
    [
      "administrator",
      "public_viewer",
      "owner",
      "bank_verifier",
      ...staffRoles,
    ].includes(role),
    "Select a valid role.",
  );
  if (role === "owner")
    demand(
      typeof owner_id === "string" && uuidPattern.test(owner_id),
      "Select a valid owner profile.",
    );
  demand(
    staffRoles.includes(role) || !input.officer,
    "This role does not use an officer profile.",
  );
  return transaction(async (client) => {
    let officerId: string | null = null;
    if (staffRoles.includes(role)) {
      if (input.officer_id) {
        demand(
          !input.officer,
          "Choose an existing officer or create a new one, not both.",
        );
        demand(
          typeof input.officer_id === "string" &&
            uuidPattern.test(input.officer_id),
          "Select a valid officer profile.",
        );
        const links = await accountLinks(client, role, null, input.officer_id);
        officerId = links.officer_id as string;
      } else {
        demand(
          input.officer &&
            typeof input.officer === "object" &&
            !Array.isArray(input.officer),
          "Enter the new officer's name and office.",
        );
        demand(
          Object.keys(input.officer).every((k) =>
            ["officer_name", "office_id", "email", "phone"].includes(k),
          ),
          "Unsupported officer fields; designation follows the account role.",
        );
        const resource = resourceMap.get("officers")!;
        const data = validateRecord(resource, {
          ...input.officer,
          designation: role,
          active: true,
        });
        await validateRelations(client, actor, resource, data);
        const officer = await insert(client, "officers", data);
        officerId = officer.id;
        await audit(client, actor, "create", "officers", officer.id, {
          source: "account_creation",
          fields: Object.keys(data),
        });
      }
    }
    const links = await accountLinks(client, role, owner_id, officerId);
    const row = await insert(client, "users", {
      username,
      password_hash: hashPassword(password),
      role,
      ...links,
    });
    await audit(client, actor, "create", "users", row.id, { role });
    delete row.password_hash;
    return row;
  });
}

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
