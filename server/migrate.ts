import { readFile } from "node:fs/promises";
import { pool, assertCockroach } from "./db.js";
import { upgradePublicRole } from "./upgrade-public-role.js";

try {
  await assertCockroach();
  await pool.query(
    await readFile(new URL("./schema.sql", import.meta.url), "utf8"),
  );
  await upgradePublicRole(pool);
  console.log("Approved schema applied successfully (18 tables).");
} finally {
  await pool.end();
}
