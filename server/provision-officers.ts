import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";
import type { Actor } from "./resources.js";
import { demand, HttpError } from "./errors.js";

// Read-only preview by default. All creations/link repairs commit atomically with audit events.
export async function provisionOfficers(
  client: pg.PoolClient,
  actor: Actor,
  apply: boolean,
  passwordSuffix: string,
) {
  demand(
    actor.role === "administrator",
    "Administrator access is required.",
    403,
  );
  const { insert, audit } = await import("./business.js");
  const { accountLinks } = await import("./accounts.js");
  const { hashPassword } = await import("./auth.js");
  const officers = (
    await client.query(
      "SELECT * FROM officers WHERE active=true ORDER BY designation,officer_name,id FOR UPDATE",
    )
  ).rows;
  const accounts = (
    await client.query(
      "SELECT id,username,role,officer_id,active FROM users ORDER BY created_at,id",
    )
  ).rows;
  const defaults: Record<string, string> = {
    survey_officer: "survery",
    valuation_officer: "valuation",
    sub_registrar: "registrar",
    bank_verifier: "bank",
    auditor: "audit",
  };
  const report: {
    officer: string;
    role: string;
    username: string;
    status: string;
  }[] = [];
  const used = new Set(accounts.map((account) => account.username));
  for (const officer of officers) {
    const linked = accounts.filter(
      (a) => a.active && a.officer_id === officer.id,
    );
    demand(
      linked.length <= 1,
      `Officer ${officer.officer_name} has multiple active accounts. Resolve them in User accounts first.`,
      409,
    );
    if (linked.length) {
      demand(
        linked[0].role === officer.designation,
        `Account ${linked[0].username} has a mismatched role.`,
        409,
      );
      report.push({
        officer: officer.officer_name,
        role: officer.designation,
        username: linked[0].username,
        status: "preserved",
      });
      continue;
    }
    const unlinked = accounts.filter(
      (a) => a.active && a.role === officer.designation && !a.officer_id,
    );
    const missing = officers.filter(
      (o) =>
        o.designation === officer.designation &&
        !accounts.some((a) => a.active && a.officer_id === o.id),
    );
    if (unlinked.length) {
      // Never guess a person's office where more than one mapping is possible.
      demand(
        unlinked.length === 1 && missing.length === 1,
        `Link the existing ${officer.designation} accounts to their officers in User accounts before provisioning.`,
        409,
      );
      if (apply) {
        const links = await accountLinks(
          client,
          officer.designation,
          null,
          officer.id,
          unlinked[0].id,
        );
        await client.query(
          "UPDATE users SET officer_id=$1,updated_at=now() WHERE id=$2",
          [links.officer_id, unlinked[0].id],
        );
        await audit(
          client,
          actor,
          "link_profile",
          "users",
          unlinked[0].id,
          links,
        );
      }
      unlinked[0].officer_id = officer.id;
      report.push({
        officer: officer.officer_name,
        role: officer.designation,
        username: unlinked[0].username,
        status: apply ? "linked" : "would_link",
      });
      continue;
    }
    // Reuse the registry's existing prefix for this role when it has numbered accounts.
    const prefixes = accounts
      .filter((a) => a.role === officer.designation)
      .map((a) => /^([a-z][a-z_-]*?)(\d+)$/.exec(a.username)?.[1])
      .filter(Boolean) as string[];
    const prefix =
      prefixes.sort(
        (a, b) =>
          prefixes.filter((p) => p === b).length -
            prefixes.filter((p) => p === a).length || a.localeCompare(b),
      )[0] || defaults[officer.designation];
    demand(prefix, "Unsupported officer designation.");
    let n = 1;
    while (used.has(`${prefix}${n}`)) n++;
    const username = `${prefix}${n}`;
    used.add(username);
    if (apply) {
      const password =
        username[0].toUpperCase() + username.slice(1) + passwordSuffix;
      demand(
        passwordSuffix.length > 0 &&
          password.length >= 12 &&
          password.length <= 128,
        "Set OFFICER_PASSWORD_SUFFIX so generated passwords have 12–128 characters.",
      );
      const links = await accountLinks(
        client,
        officer.designation,
        null,
        officer.id,
      );
      const row = await insert(client, "users", {
        username,
        password_hash: hashPassword(password),
        role: officer.designation,
        ...links,
      });
      await audit(client, actor, "create", "users", row.id, {
        role: officer.designation,
        officer_id: officer.id,
      });
      accounts.push({
        id: row.id,
        username,
        role: officer.designation,
        officer_id: officer.id,
        active: true,
      });
    }
    report.push({
      officer: officer.officer_name,
      role: officer.designation,
      username,
      status: apply ? "created" : "would_create",
    });
  }
  const needsProfile = accounts
    .filter((a) => a.active && defaults[a.role] && !a.officer_id)
    .map((a) => a.username);
  return { accounts: report, accounts_needing_officer_profiles: needsProfile };
}
async function main() {
  demand(
    process.argv.slice(2).every((arg) => ["--hosted", "--apply"].includes(arg)),
    "Use --hosted and/or --apply only.",
  );
  if (process.argv.includes("--hosted")) {
    const connection = process.env.HOSTED_DATABASE_URL;
    demand(
      connection,
      "Set HOSTED_DATABASE_URL in the ignored .env file first.",
    );
    const url = new URL(connection);
    demand(
      ["postgres:", "postgresql:"].includes(url.protocol) &&
        url.searchParams.get("sslmode") === "verify-full" &&
        !["localhost", "127.0.0.1", "::1"].includes(url.hostname),
      "The hosted database connection must use sslmode=verify-full and a remote host.",
    );
    process.env.DATABASE_URL = connection;
  }
  const { pool, transaction, assertCockroach } = await import("./db.js");
  try {
    await assertCockroach();
    const result = await transaction(async (client) => {
      const actor = (
        await client.query(
          "SELECT id,username,role,owner_id,officer_id FROM users WHERE role='administrator' AND active=true ORDER BY created_at,id LIMIT 1",
        )
      ).rows[0];
      demand(actor, "An active administrator is required before provisioning.");
      return provisionOfficers(
        client,
        actor,
        process.argv.includes("--apply"),
        process.env.OFFICER_PASSWORD_SUFFIX || "",
      );
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await pool.end();
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main();
  } catch (error) {
    // Connection errors can include server detail; never print connection strings or credentials.
    console.error(
      error instanceof HttpError
        ? error.message
        : "Provisioning failed. Check the database connection and profile links. No partial account changes were committed.",
    );
    process.exitCode = 1;
  }
}
