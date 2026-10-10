import "dotenv/config";
import path from "node:path";

export const config = {
  databaseUrl: process.env.DATABASE_URL || "",
  sessionSecret: process.env.SESSION_SECRET || "",
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || "127.0.0.1",
  origin: process.env.APP_ORIGIN || "http://127.0.0.1:5173",
  uploads: path.resolve(process.env.UPLOAD_DIR || "uploads"),
  production: process.env.NODE_ENV === "production",
};
export function checkConfig() {
  if (!config.databaseUrl)
    throw new Error("Set DATABASE_URL in .env. CockroachDB is required.");
  if (
    config.sessionSecret.length < 32 ||
    config.sessionSecret.startsWith("replace-")
  ) {
    throw new Error(
      "Set a random SESSION_SECRET (32+ characters), or run npm run setup.",
    );
  }
  if (config.production && !config.origin.startsWith("https://"))
    throw new Error("Production APP_ORIGIN must use HTTPS.");
}
