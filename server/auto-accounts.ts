import type pg from "pg";
import { hashPassword } from "./auth.js";
import { audit, insert } from "./business.js";
import { demand } from "./errors.js";
import type { Actor } from "./resources.js";

const prefixes: Record<string, string> = {
  owner: "owner",
  survey_officer: "survey",
  valuation_officer: "valuation",
  sub_registrar: "subregistrar",
  bank_verifier: "bank",
  auditor: "audit",
};

export type CreatedLogin = {
  username: string;
  password: string;
  role: string;
  profile_name: string;
};

export function numberedLogin(
  role: string,
  accounts: { username: string; role: string }[],
) {
  demand(prefixes[role], "This profile has no supported account role.");
  const existingPrefixes = accounts
    .filter((account) => account.role === role)
    .map((account) => /^([a-z][a-z_-]*?)(\d+)$/.exec(account.username)?.[1])
    .filter((prefix): prefix is string => !!prefix);
  const prefix =
    existingPrefixes.sort(
      (a, b) =>
        existingPrefixes.filter((item) => item === b).length -
          existingPrefixes.filter((item) => item === a).length ||
        a.localeCompare(b),
    )[0] || prefixes[role];
  const used = new Set(accounts.map((account) => account.username));
  let number = 1;
  // Keep retired usernames reserved so historical identities are never reused.
  while (used.has(`${prefix}${number}`)) number++;
  const username = `${prefix}${number}`;
  return {
    username,
    password: username[0].toUpperCase() + username.slice(1) + "@landledger",
  };
}

/** Call inside the profile's serializable transaction; credentials are returned once. */
export async function ensureProfileAccount(
  client: pg.PoolClient,
  actor: Actor,
  type: "owners" | "officers",
  profile: Record<string, any>,
): Promise<CreatedLogin | null> {
  demand(
    actor.role === "administrator" ||
      (type === "owners" && actor.role === "sub_registrar"),
    "You cannot create an account for this profile.",
    403,
  );
  // Serialize numbered allocation with other automatic profile creations.
  await client.query(
    "SELECT id FROM users WHERE role='administrator' ORDER BY id LIMIT 1 FOR UPDATE",
  );
  const column = type === "owners" ? "owner_id" : "officer_id";
  const linked = (
    await client.query(`SELECT id FROM users WHERE ${column}=$1 LIMIT 1`, [
      profile.id,
    ])
  ).rows;
  // Preserve existing credentials and explicitly disabled/deleted accounts.
  if (linked.length) return null;
  const role = type === "owners" ? "owner" : profile.designation;
  const accounts = (await client.query("SELECT username,role FROM users")).rows;
  const login = numberedLogin(role, accounts);
  const account = await insert(client, "users", {
    username: login.username,
    password_hash: hashPassword(login.password),
    role,
    owner_id: type === "owners" ? profile.id : null,
    officer_id: type === "officers" ? profile.id : null,
    active: type === "owners" || profile.active,
  });
  await audit(client, actor, "create", "users", account.id, {
    role,
    [column]: profile.id,
    source: "automatic_profile_account",
  });
  return {
    ...login,
    role,
    profile_name: type === "owners" ? profile.owner_name : profile.officer_name,
  };
}

export async function provisionProfileAccounts(
  client: pg.PoolClient,
  actor: Actor,
) {
  demand(
    actor.role === "administrator",
    "Administrator access is required.",
    403,
  );
  const created: CreatedLogin[] = [];
  for (const type of ["owners", "officers"] as const) {
    const name = type === "owners" ? "owner_name" : "officer_name";
    const profiles = (
      await client.query(`SELECT * FROM ${type} ORDER BY ${name},id FOR UPDATE`)
    ).rows;
    for (const profile of profiles) {
      const login = await ensureProfileAccount(client, actor, type, profile);
      if (login) created.push(login);
    }
  }
  return created;
}
