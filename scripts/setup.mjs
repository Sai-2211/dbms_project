import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

if (!existsSync(".env")) {
  writeFileSync(
    ".env",
    `DATABASE_URL=postgresql://root@127.0.0.1:26257/landledger?sslmode=disable\nSESSION_SECRET=${randomBytes(48).toString("hex")}\nPORT=3001\nAPP_ORIGIN=http://127.0.0.1:5173\nUPLOAD_DIR=uploads\nDEMO_ADMIN_PASSWORD=LandLedger@2026\nNODE_ENV=development\n`,
    { mode: 0o600 },
  );
  console.log(
    "Created local .env. Start CockroachDB, then run npm run db:migrate and npm run db:seed.",
  );
} else console.log("Existing .env kept.");
