import "dotenv/config";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import type { Actor } from "../../server/resources.js";

// Every run creates and drops its OWN isolated database. Never deletes application data.
const base = process.env.DATABASE_URL;
if (!base)
  throw new Error(
    "Set DATABASE_URL for a local CockroachDB instance before running integration tests.",
  );
const name = `landledger_test_${Date.now()}_${process.pid}`;
const control = new pg.Pool({ connectionString: base });
const url = new URL(base);
url.pathname = `/${name}`;
process.env.DATABASE_URL = url.toString();
process.env.PORT = "3101";
process.env.APP_ORIGIN = "http://127.0.0.1:3101";
process.env.SESSION_SECRET =
  "isolated-test-session-secret-with-over-32-characters";
const { pool, transaction, assertCockroach } =
  await import("../../server/db.js");
const { insert, approveTransfer, validateRelations } =
  await import("../../server/business.js");
const { hashPassword } = await import("../../server/auth.js");
const { resourceMap } = await import("../../server/resources.js");
let child: ChildProcess | undefined;
let uploadDir = "";
const password = "Integration@2026";
let actor: Actor;
let officer: Record<string, any>;
let office: Record<string, any>;
let district: Record<string, any>;
let bank: Record<string, any>;
let ownerUser: Record<string, any>;

before(async () => {
  await control.query(`CREATE DATABASE ${name}`);
  await assertCockroach();
  await pool.query(
    await readFile(new URL("../../server/schema.sql", import.meta.url), "utf8"),
  );
  await transaction(async (client) => {
    district = await insert(client, "districts", {
      district_name: "Test District",
      state_name: "Test State",
    });
    office = await insert(client, "offices", {
      office_name: "Test Registry",
      office_code: randomUUID(),
      district_id: district.id,
      address: "Fictional test address",
    });
    officer = await insert(client, "officers", {
      officer_name: "Test Registrar",
      designation: "sub_registrar",
      office_id: office.id,
      active: true,
    });
    const admin = await insert(client, "users", {
      username: "test-admin",
      password_hash: hashPassword(password),
      role: "administrator",
    });
    actor = {
      id: admin.id,
      username: admin.username,
      role: "administrator",
      owner_id: null,
      officer_id: null,
    };
    bank = await insert(client, "users", {
      username: "test-bank",
      password_hash: hashPassword(password),
      role: "bank_verifier",
    });
    const owner = await insert(client, "owners", {
      owner_name: "Portal Owner",
      identification_no: randomUUID(),
      address: "Test private address",
      phone: "0000000000",
      email: "private@example.test",
    });
    ownerUser = await insert(client, "users", {
      username: "test-owner",
      password_hash: hashPassword(password),
      role: "owner",
      owner_id: owner.id,
    });
  });
  uploadDir = await mkdtemp(path.join(tmpdir(), "landledger-test-"));
  child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    env: { ...process.env, UPLOAD_DIR: uploadDir, NODE_ENV: "development" },
    stdio: "ignore",
  });
  let ready = false;
  for (let n = 0; n < 100; n++) {
    try {
      const response = await fetch("http://127.0.0.1:3101/api/health");
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, "Isolated test API starts successfully");
});
after(async () => {
  if (child && !child.killed) {
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => child!.once("exit", () => resolve()));
  }
  await pool.end();
  await control.query(`DROP DATABASE IF EXISTS ${name} CASCADE`);
  await control.end();
  if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
});

async function fixture() {
  return transaction(async (client) => {
    const seller = await insert(client, "owners", {
      owner_name: "Test Seller",
      identification_no: randomUUID(),
      address: "Fictional address",
    });
    const buyer = await insert(client, "owners", {
      owner_name: "Test Buyer",
      identification_no: randomUUID(),
      address: "Fictional address",
    });
    const property = await insert(client, "properties", {
      survey_no: randomUUID(),
      property_type: "residential",
      area: "250",
      location: "Test location",
      boundary_details: "Fictional boundaries",
      district_id: district.id,
      office_id: office.id,
    });
    const initial = await insert(client, "transactions", {
      property_id: property.id,
      office_id: office.id,
      transaction_type: "registration",
      transaction_date: "2025-01-01",
      consideration: "1000",
    });
    await insert(client, "transaction_parties", {
      transaction_id: initial.id,
      owner_id: seller.id,
      role: "transferee",
      share: "1",
    });
    await insert(client, "documents", {
      document_no: randomUUID(),
      property_id: property.id,
      transaction_id: initial.id,
      document_type: "registration_deed",
      document_date: "2025-01-01",
      verification_status: "verified",
      verifying_officer_id: officer.id,
      verified_date: "2025-01-01",
      file_key: "test-fixture.pdf",
    });
    await approveTransfer(client, actor, initial.id, officer.id);
    return { seller, buyer, property, initial };
  });
}
async function sale(f: Awaited<ReturnType<typeof fixture>>, share = "1") {
  return transaction(async (client) => {
    const tx = await insert(client, "transactions", {
      property_id: f.property.id,
      office_id: office.id,
      transaction_type: "sale",
      transaction_date: "2025-02-01",
      consideration: "1200",
    });
    await insert(client, "transaction_parties", {
      transaction_id: tx.id,
      owner_id: f.seller.id,
      role: "transferor",
      share,
    });
    await insert(client, "transaction_parties", {
      transaction_id: tx.id,
      owner_id: f.buyer.id,
      role: "transferee",
      share,
    });
    const doc = await insert(client, "documents", {
      document_no: randomUUID(),
      property_id: f.property.id,
      transaction_id: tx.id,
      document_type: "sale_deed",
      document_date: "2025-02-01",
      verification_status: "verified",
      verifying_officer_id: officer.id,
      verified_date: "2025-02-01",
      file_key: "test-fixture.pdf",
    });
    return { tx, doc };
  });
}
async function request(
  endpoint: string,
  cookie?: string,
  method = "GET",
  body?: unknown,
) {
  const response = await fetch(`http://127.0.0.1:3101/api${endpoint}`, {
    method,
    headers: {
      "X-LandLedger-Request": "1",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
async function login(username: string) {
  const result = await request("/auth/login", undefined, "POST", {
    username,
    password,
  });
  assert.equal(result.status, 200);
  return result.cookie!;
}

test("foreign keys reject nonexistent land parcels", async () => {
  await assert.rejects(
    () =>
      transaction((c) =>
        insert(c, "encumbrances", {
          property_id: randomUUID(),
          encumbrance_type: "lien",
          claimant_name: "Test",
          start_date: "2025-01-01",
          status: "active",
          details: "Test",
        }),
      ),
    (e: any) => e.code === "23503",
  );
});
test("approval creates ownership history and a mutation atomically", async () => {
  const f = await fixture(),
    { tx } = await sale(f);
  await transaction((c) => approveTransfer(c, actor, tx.id, officer.id));
  const holdings = (
    await pool.query(
      "SELECT * FROM ownerships WHERE property_id=$1 ORDER BY valid_from",
      [f.property.id],
    )
  ).rows;
  assert.equal(holdings.length, 2);
  assert.equal(holdings[0].valid_to, "2025-02-01");
  assert.equal(holdings[1].owner_id, f.buyer.id);
  assert.equal(holdings[1].valid_to, null);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*) AS n FROM mutations WHERE transaction_id=$1",
        [tx.id],
      )
    ).rows[0].n,
    "1",
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*) AS n FROM audit_events WHERE entity_id=$1 AND action='approve'",
        [tx.id],
      )
    ).rows[0].n,
    "1",
  );
});
test("a late audit failure rolls back every ownership and transaction update", async () => {
  const f = await fixture(),
    { tx } = await sale(f);
  await assert.rejects(
    () =>
      transaction((c) =>
        approveTransfer(c, { ...actor, id: randomUUID() }, tx.id, officer.id),
      ),
    (e: any) => e.code === "23503",
  );
  const current = (
    await pool.query(
      "SELECT owner_id,valid_to FROM ownerships WHERE property_id=$1",
      [f.property.id],
    )
  ).rows;
  assert.equal(current.length, 1);
  assert.equal(current[0].owner_id, f.seller.id);
  assert.equal(current[0].valid_to, null);
  assert.equal(
    (await pool.query("SELECT status FROM transactions WHERE id=$1", [tx.id]))
      .rows[0].status,
    "pending",
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*) AS n FROM mutations WHERE transaction_id=$1",
        [tx.id],
      )
    ).rows[0].n,
    "0",
  );
});
test("two simultaneous sales cannot both consume the same ownership", async () => {
  const f = await fixture();
  const a = await sale(f),
    b = await sale(f);
  const results = await Promise.allSettled([
    transaction((c) => approveTransfer(c, actor, a.tx.id, officer.id)),
    transaction((c) => approveTransfer(c, actor, b.tx.id, officer.id)),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const current = (
    await pool.query(
      "SELECT owner_id,share FROM ownerships WHERE property_id=$1 AND valid_to IS NULL",
      [f.property.id],
    )
  ).rows;
  assert.equal(current.length, 1);
  assert.equal(current[0].owner_id, f.buyer.id);
  assert.equal(Number(current[0].share), 1);
});
test("a partial transfer retains joint ownership with exact shares", async () => {
  const f = await fixture(),
    { tx } = await sale(f, "0.25");
  await transaction((c) => approveTransfer(c, actor, tx.id, officer.id));
  const current = (
    await pool.query(
      "SELECT owner_id,share FROM ownerships WHERE property_id=$1 AND valid_to IS NULL",
      [f.property.id],
    )
  ).rows;
  assert.equal(
    Number(current.find((h) => h.owner_id === f.seller.id).share),
    0.75,
  );
  assert.equal(
    Number(current.find((h) => h.owner_id === f.buyer.id).share),
    0.25,
  );
});
test("unverified deeds and mismatched shares block approval without partial updates", async () => {
  const f = await fixture(),
    { tx, doc } = await sale(f);
  await pool.query(
    "UPDATE documents SET verification_status='pending',verifying_officer_id=NULL,verified_date=NULL WHERE id=$1",
    [doc.id],
  );
  await assert.rejects(
    () => transaction((c) => approveTransfer(c, actor, tx.id, officer.id)),
    /verify the matching deed/,
  );
  await pool.query(
    "UPDATE documents SET verification_status='verified',verifying_officer_id=$1,verified_date='2025-02-01' WHERE id=$2",
    [officer.id, doc.id],
  );
  await pool.query(
    "UPDATE transaction_parties SET share='0.5' WHERE transaction_id=$1 AND role='transferee'",
    [tx.id],
  );
  await assert.rejects(
    () => transaction((c) => approveTransfer(c, actor, tx.id, officer.id)),
    /shares must match/,
  );
  assert.equal(
    (await pool.query("SELECT status FROM transactions WHERE id=$1", [tx.id]))
      .rows[0].status,
    "pending",
  );
});
test("active encumbrances block ownership transfers", async () => {
  const f = await fixture(),
    { tx } = await sale(f);
  await transaction((c) =>
    insert(c, "encumbrances", {
      property_id: f.property.id,
      encumbrance_type: "dispute",
      claimant_name: "Test",
      start_date: "2025-01-15",
      status: "active",
      details: "Fictional dispute",
    }),
  );
  await assert.rejects(
    () => transaction((c) => approveTransfer(c, actor, tx.id, officer.id)),
    /Resolve active/,
  );
});
test("party records cannot be moved out of an approved transaction", async () => {
  const f = await fixture(),
    { tx } = await sale(f);
  const party = (
    await pool.query(
      "SELECT * FROM transaction_parties WHERE transaction_id=$1",
      [f.initial.id],
    )
  ).rows[0];
  await assert.rejects(
    () =>
      transaction((c) =>
        validateRelations(
          c,
          actor,
          resourceMap.get("transaction_parties")!,
          { transaction_id: tx.id },
          party,
        ),
      ),
    /cannot be moved/,
  );
});
test("bank access masks private owner details and rejects document access and writes", async () => {
  const cookie = await login("test-bank");
  const owners = await request("/records/owners", cookie);
  assert.equal(owners.status, 200);
  assert.equal(owners.body.rows.length > 0, true);
  assert.equal("identification_no" in owners.body.rows[0], false);
  assert.equal("address" in owners.body.rows[0], false);
  assert.equal((await request("/records/documents", cookie)).status, 403);
  assert.equal(
    (await request("/records/properties", cookie, "POST", { data: {} })).status,
    403,
  );
});
test("owner portal sees only its own parcels and protects unrelated record IDs", async () => {
  const f = await fixture();
  const cookie = await login("test-owner");
  assert.equal(
    (await request(`/records/properties/${f.property.id}`, cookie)).status,
    404,
  );
  const record = {
    survey_no: randomUUID(),
    property_type: "residential",
    area: "75",
    location: "Owner test parcel",
    boundary_details: "Test boundary",
    district_id: district.id,
    office_id: office.id,
  };
  const created = await request("/records/properties", cookie, "POST", {
    data: record,
  });
  assert.equal(created.status, 201);
  const properties = await request("/records/properties", cookie);
  assert.equal(properties.body.total, 1);
  assert.equal(properties.body.rows[0].id, created.body.id);
  const apps = await request("/records/applications", cookie);
  assert.equal(apps.body.total, 1);
  assert.equal(apps.body.rows[0].applicant_owner_id, ownerUser.owner_id);
});
test("API status filters work and direct approval bypasses are rejected", async () => {
  const f = await fixture(),
    { tx } = await sale(f),
    cookie = await login("test-admin");
  const filtered = await request(
    "/records/transactions?status=pending",
    cookie,
  );
  assert.equal(filtered.status, 200);
  assert.equal(
    filtered.body.rows.every((r: any) => r.status === "pending"),
    true,
  );
  assert.equal(
    (
      await request(`/records/transactions/${tx.id}`, cookie, "PATCH", {
        data: { status: "approved" },
      })
    ).status,
    400,
  );
  const response = await fetch("http://127.0.0.1:3101/api/records/districts", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      data: { district_name: "Other", state_name: "Test" },
    }),
  });
  assert.equal(response.status, 403);
});
test("digital uploads validate file contents and persist downloadable copies", async () => {
  const f = await fixture(),
    { doc } = await sale(f),
    cookie = await login("test-admin");
  await pool.query(
    "UPDATE documents SET verification_status='pending',verifying_officer_id=NULL,verified_date=NULL,file_key=NULL WHERE id=$1",
    [doc.id],
  );
  const bad = new FormData();
  bad.append(
    "file",
    new Blob(["this is not a PDF"], { type: "application/pdf" }),
    "bad.pdf",
  );
  const rejected = await fetch(
    `http://127.0.0.1:3101/api/documents/${doc.id}/file`,
    {
      method: "POST",
      headers: { Cookie: cookie, "X-LandLedger-Request": "1" },
      body: bad,
    },
  );
  assert.equal(rejected.status, 400);
  const good = new FormData();
  good.append(
    "file",
    new Blob(["%PDF-1.4\nFictional test fixture"], { type: "application/pdf" }),
    "test.pdf",
  );
  const uploaded = await fetch(
    `http://127.0.0.1:3101/api/documents/${doc.id}/file`,
    {
      method: "POST",
      headers: { Cookie: cookie, "X-LandLedger-Request": "1" },
      body: good,
    },
  );
  assert.equal(uploaded.status, 200);
  const downloaded = await fetch(
    `http://127.0.0.1:3101/api/documents/${doc.id}/file`,
    { headers: { Cookie: cookie } },
  );
  assert.equal(downloaded.status, 200);
  assert.match(await downloaded.text(), /^%PDF/);
});
