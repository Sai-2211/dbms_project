import { readFile } from "node:fs/promises";
import { pool, assertCockroach } from "./db.js";

try {
  await assertCockroach();
  await pool.query(
    await readFile(new URL("./schema.sql", import.meta.url), "utf8"),
  );
  console.log("Approved schema applied successfully (18 tables).");
} finally {
  await pool.end();
}
