import pg from "pg";
import { Writable } from "node:stream";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { hashPassword } from "./auth.js";

export const administratorUsername = "admin@landledger.local";

export class AdministratorSetupError extends Error {}

export function validateAdminConnection(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new AdministratorSetupError(
      "Enter the complete DATABASE_URL from Render.",
    );
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !url.username ||
    url.pathname.length < 2 ||
    url.hash
  )
    throw new AdministratorSetupError(
      "Enter a PostgreSQL connection URL with a SQL user, host and database name.",
    );
  let password: string;
  try {
    password = decodeURIComponent(url.password);
  } catch {
    throw new AdministratorSetupError(
      "URL-encode special characters in the SQL password.",
    );
  }
  if (
    !password ||
    /<|>|ENTER-SQL-USER-PASSWORD|YOUR_SQL_PASSWORD|URL_ENCODED_PASSWORD/.test(
      password,
    )
  )
    throw new AdministratorSetupError(
      "Replace the SQL password placeholder privately before continuing.",
    );
  const tls = url.searchParams.getAll("sslmode");
  if (tls.length !== 1 || tls[0] !== "verify-full")
    throw new AdministratorSetupError(
      "The cloud DATABASE_URL must contain exactly one sslmode=verify-full setting.",
    );
  return url;
}

export function validateAdministratorPassword(password: string) {
  if (
    password.trim().length < 12 ||
    password.length > 128 ||
    password === "LandLedger@2026"
  )
    throw new AdministratorSetupError(
      "Choose a private application password of 12–128 characters; the published local demo password is not allowed.",
    );
}

/** Only the fixed administrator identity is affected; no schema or demo files are created. */
export async function initializeAdministrator(
  pool: pg.Pool,
  password: string,
  resetPassword = false,
): Promise<"created" | "exists" | "reset"> {
  validateAdministratorPassword(password);
  const hash = hashPassword(password);
  const client = await pool.connect();
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      try {
        const previous = (
          await client.query(
            "SELECT id,role FROM users WHERE username=$1 FOR UPDATE",
            [administratorUsername],
          )
        ).rows[0];
        if (previous && previous.role !== "administrator")
          throw new AdministratorSetupError(
            "That username belongs to another role. No account was changed.",
          );
        if (previous && !resetPassword) {
          await client.query("COMMIT");
          return "exists";
        }
        const user = previous
          ? (
              await client.query(
                "UPDATE users SET password_hash=$1,active=true,updated_at=now() WHERE id=$2 RETURNING id",
                [hash, previous.id],
              )
            ).rows[0]
          : (
              await client.query(
                "INSERT INTO users(username,password_hash,role) VALUES($1,$2,$3) RETURNING id",
                [administratorUsername, hash, "administrator"],
              )
            ).rows[0];
        await client.query(
          "INSERT INTO audit_events(actor_id,action,entity_type,entity_id,summary) VALUES($1,$2,$3,$4,$5)",
          [
            user.id,
            previous ? "reset_password" : "create",
            "users",
            user.id,
            JSON.stringify({ source: "local-admin-setup" }),
          ],
        );
        await client.query("COMMIT");
        return previous ? "reset" : "created";
      } catch (error) {
        await client.query("ROLLBACK");
        if (
          !["40001", "23505"].includes(
            (error as { code?: string }).code || "",
          ) ||
          attempt === 4
        )
          throw error;
        await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt));
      }
    }
    throw new AdministratorSetupError(
      "The database was busy. Try the setup command again.",
    );
  } finally {
    client.release();
  }
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(
      "Run this command in your Mac/VS Code terminal. It privately prompts for the cloud connection URL and application password.",
    );
    process.exitCode = 1;
    return;
  }
  if (
    process.argv.slice(2).some((argument) => argument !== "--reset-password")
  ) {
    console.error("Usage: npm run db:admin [-- --reset-password]");
    process.exitCode = 1;
    return;
  }
  let hidden = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!hidden) process.stdout.write(chunk);
      callback();
    },
  });
  const prompt = createInterface({
    input: process.stdin,
    output,
    terminal: true,
  });
  const controller = new AbortController();
  prompt.on("SIGINT", () => controller.abort());
  prompt.on("close", () => controller.abort());
  const ask = async (label: string) => {
    process.stdout.write(label);
    hidden = true;
    try {
      return await prompt.question("", { signal: controller.signal });
    } finally {
      hidden = false;
      process.stdout.write("\n");
    }
  };
  let pool: pg.Pool | undefined;
  try {
    console.log(
      "Cloud administrator setup. Secrets are hidden and are not saved to a file.",
    );
    const url = validateAdminConnection(
      await ask("Paste DATABASE_URL from Render (hidden): "),
    );
    console.log(`Target: ${url.hostname} — database ${url.pathname.slice(1)}`);
    console.log("Use the exact same database URL as your deployed service.");
    const reset = process.argv.includes("--reset-password");
    if (reset)
      console.log(
        "The existing administrator password will be replaced and the account reactivated, if it exists.",
      );
    const password = await ask(
      "Choose your application login password (hidden): ",
    );
    validateAdministratorPassword(password);
    if (password !== (await ask("Confirm application password (hidden): ")))
      throw new AdministratorSetupError(
        "The application passwords did not match. No database change was made.",
      );
    pool = new pg.Pool({
      connectionString: url.toString(),
      max: 1,
      connectionTimeoutMillis: 10000,
    });
    const version = (await pool.query("SELECT version() AS version")).rows[0]
      .version;
    if (!String(version).includes("CockroachDB"))
      throw new AdministratorSetupError(
        "This command requires CockroachDB. No account was changed.",
      );
    const result = await initializeAdministrator(pool, password, reset);
    if (result === "exists") {
      console.log(
        "Administrator already exists. Its password was left unchanged. To recover access, run npm run db:admin -- --reset-password.",
      );
    } else {
      console.log(
        `Administrator ${result === "created" ? "created" : "password reset"}. Sign in as ${administratorUsername} using the application password you just entered.`,
      );
    }
  } catch (error) {
    const code = (error as { code?: string }).code;
    const message =
      error instanceof AdministratorSetupError
        ? error.message
        : controller.signal.aborted
          ? "Setup cancelled."
          : code === "42P01"
            ? "The application tables are missing. Check that Render's DATABASE_URL matches this database and its migration succeeded."
            : code === "28P01"
              ? "The CockroachDB SQL user or SQL password is incorrect. Check DATABASE_URL privately."
              : "Could not complete account setup. Check the cloud URL, verified TLS, and CockroachDB IP allowlist. Your Mac's Current Network must be allowed.";
    console.error(message);
    process.exitCode = 1;
  } finally {
    prompt.close();
    output.end();
    await pool?.end();
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
