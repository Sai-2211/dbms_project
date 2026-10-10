import pg from "pg";
import { config } from "./config.js";

pg.types.setTypeParser(1082, (value) => value);
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  connectionTimeoutMillis: 5000,
});
pool.on("error", () => console.error("A database connection was lost."));
export async function transaction<T>(
  operation: (client: pg.PoolClient) => Promise<T>,
  attempts = 5,
): Promise<T> {
  const client = await pool.connect();
  try {
    for (let attempt = 0; attempt < attempts; attempt++) {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      try {
        const result = await operation(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        if (
          (error as { code?: string }).code !== "40001" ||
          attempt === attempts - 1
        )
          throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, 25 * 2 ** attempt + Math.random() * 30),
        );
      }
    }
    throw new Error("Transaction retry limit reached.");
  } finally {
    client.release();
  }
}
export async function assertCockroach() {
  const result = await pool.query("SELECT version() AS version");
  if (!result.rows[0].version.includes("CockroachDB"))
    throw new Error("This project requires CockroachDB.");
  return result.rows[0].version as string;
}
