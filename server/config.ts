import "dotenv/config";
import path from "node:path";

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const onRender = env.RENDER === "true";
  return {
    databaseUrl: env.DATABASE_URL || "",
    sessionSecret: env.SESSION_SECRET || "",
    port: Number(env.PORT || 3001),
    host: env.HOST || (onRender ? "0.0.0.0" : "127.0.0.1"),
    origin: (
      env.APP_ORIGIN ||
      (onRender ? env.RENDER_EXTERNAL_URL : "") ||
      "http://127.0.0.1:5173"
    ).replace(/\/+$/, ""),
    uploads: path.resolve(env.UPLOAD_DIR || "uploads"),
    production: env.NODE_ENV === "production",
    // Render's ingress is the single trusted hop immediately before this app.
    // Other hosting/proxy arrangements need their own reviewed trust policy.
    trustProxy: onRender ? 1 : false,
  };
}

export const config = readConfig();
export function checkConfig(settings = config) {
  if (!settings.databaseUrl)
    throw new Error("Set DATABASE_URL in .env. CockroachDB is required.");
  let database: URL;
  try {
    database = new URL(settings.databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a PostgreSQL connection URL.");
  }
  if (!["postgres:", "postgresql:"].includes(database.protocol))
    throw new Error("DATABASE_URL must be a PostgreSQL connection URL.");
  if (database.password.includes("ENTER-SQL-USER-PASSWORD"))
    throw new Error("Replace the SQL password placeholder in DATABASE_URL.");
  if (
    settings.sessionSecret.length < 32 ||
    settings.sessionSecret.startsWith("replace-")
  ) {
    throw new Error(
      "Set a random SESSION_SECRET (32+ characters), or run npm run setup.",
    );
  }
  let origin: URL;
  try {
    origin = new URL(settings.origin);
  } catch {
    throw new Error("APP_ORIGIN must be the website's HTTP or HTTPS origin.");
  }
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.origin !== settings.origin
  )
    throw new Error(
      "APP_ORIGIN must be an origin without a path or credentials.",
    );
  if (settings.production && origin.protocol !== "https:")
    throw new Error("Production APP_ORIGIN must use HTTPS.");
  if (
    settings.production &&
    database.searchParams.get("sslmode") !== "verify-full"
  )
    throw new Error("Production DATABASE_URL must use sslmode=verify-full.");
  if (
    !Number.isInteger(settings.port) ||
    settings.port < 1 ||
    settings.port > 65535
  )
    throw new Error("PORT must be a whole number between 1 and 65535.");
}
