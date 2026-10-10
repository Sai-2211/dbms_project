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
let surveyor: Record<string, any>;
let valuer: Record<string, any>;

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
    for (const role of [
      "survey_officer",
      "valuation_officer",
      "sub_registrar",
      "auditor",
    ] as const) {
      const profile =
        role === "sub_registrar"
          ? officer
          : await insert(client, "officers", {
              officer_name: `Test ${role}`,
              designation: role,
              office_id: office.id,
              active: true,
            });
      if (role === "survey_officer") surveyor = profile;
      if (role === "valuation_officer") valuer = profile;
      await insert(client, "users", {
        username: `test-${role}`,
        password_hash: hashPassword(password),
        role,
        officer_id: profile.id,
      });
    }
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
  if (cookies.has(username)) return cookies.get(username)!;
  const result = await request("/auth/login", undefined, "POST", {
    username,
    password,
  });
  assert.equal(result.status, 200);
  cookies.set(username, result.cookie!);
  return result.cookie!;
}
const cookies = new Map<string, string>();

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

async function create(
  key: string,
  data: unknown,
  cookie: string,
  extra: Record<string, unknown> = {},
) {
  const result = await request(`/records/${key}`, cookie, "POST", {
    data,
    ...extra,
  });
  assert.equal(result.status, 201, `${key}: ${JSON.stringify(result.body)}`);
  return result.body;
}
async function uploadPdf(id: string, cookie: string) {
  const data = new FormData();
  data.append(
    "file",
    new Blob(["%PDF-1.4\nFictional QA fixture"], { type: "application/pdf" }),
    "fixture.pdf",
  );
  const response = await fetch(
    `http://127.0.0.1:3101/api/documents/${id}/file`,
    {
      method: "POST",
      headers: { Cookie: cookie, "X-LandLedger-Request": "1" },
      body: data,
    },
  );
  assert.equal(response.status, 200);
}

test("the complete API registration workflow verifies a file and persists approved ownership", async () => {
  const cookie = await login("test-admin");
  const owner = await create(
    "owners",
    {
      owner_name: "API Owner",
      identification_no: randomUUID(),
      address: "Fictional API address",
    },
    cookie,
  );
  const prop = await create(
    "properties",
    {
      survey_no: randomUUID(),
      property_type: "agricultural",
      area: "400.1234",
      location: "API parcel",
      boundary_details: "API boundary",
      district_id: district.id,
      office_id: office.id,
    },
    cookie,
  );
  const tx = await create(
    "transactions",
    {
      property_id: prop.id,
      office_id: office.id,
      transaction_type: "registration",
      transaction_date: "2025-01-01",
      consideration: "0",
    },
    cookie,
  );
  await create(
    "transaction_parties",
    {
      transaction_id: tx.id,
      owner_id: owner.id,
      role: "transferee",
      share: "1",
    },
    cookie,
  );
  const doc = await create(
    "documents",
    {
      document_no: randomUUID(),
      property_id: prop.id,
      transaction_id: tx.id,
      document_type: "registration_deed",
      document_date: "2025-01-01",
    },
    cookie,
  );
  assert.equal(
    (
      await request(`/records/documents/${doc.id}/review`, cookie, "POST", {
        action: "approve",
        officer_id: officer.id,
      })
    ).status,
    400,
  );
  await uploadPdf(doc.id, cookie);
  assert.equal(
    (
      await request(`/records/documents/${doc.id}/review`, cookie, "POST", {
        action: "approve",
        officer_id: officer.id,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/records/transactions/${tx.id}/review`, cookie, "POST", {
        action: "approve",
        officer_id: officer.id,
      })
    ).status,
    200,
  );
  const saved = await request(`/records/properties/${prop.id}`, cookie);
  assert.equal(saved.body.registration_status, "registered");
  assert.equal(saved.body.registration_date, "2025-01-01");
  const holdings = await request(
    `/records/ownerships?property_id=${prop.id}`,
    cookie,
  );
  assert.equal(holdings.body.rows[0].share, "1.00000000");
  assert.equal(holdings.body.rows[0].owner_id, owner.id);
  assert.equal(
    (
      await request(`/records/transactions/${tx.id}/review`, cookie, "POST", {
        action: "approve",
        officer_id: officer.id,
      })
    ).status,
    409,
  );
});

test("all other primary modules accept valid input and preserve historical records", async () => {
  const cookie = await login("test-admin"),
    f = await fixture();
  const d = await create(
    "districts",
    { district_name: randomUUID(), state_name: "Test State" },
    cookie,
  );
  const o = await create(
    "offices",
    {
      office_name: "API Registry",
      office_code: randomUUID(),
      district_id: d.id,
      address: "Fictional address",
    },
    cookie,
  );
  await create(
    "officers",
    {
      officer_name: "API Surveyor",
      designation: "survey_officer",
      office_id: o.id,
      active: true,
    },
    cookie,
  );
  const s = await create(
    "surveys",
    {
      property_id: f.property.id,
      officer_id: surveyor.id,
      survey_no: randomUUID(),
      survey_date: "2025-02-01",
      survey_area: "275.125",
      boundary_details: "Revised QA boundaries",
      survey_status: "completed",
    },
    cookie,
  );
  assert.equal(
    (await request(`/records/properties/${f.property.id}`, cookie)).body.area,
    "275.1250",
  );
  assert.equal(
    (
      await request(`/records/surveys/${s.id}`, cookie, "PATCH", {
        data: { survey_area: "1" },
      })
    ).status,
    409,
  );
  const v = await create(
    "valuations",
    {
      property_id: f.property.id,
      officer_id: valuer.id,
      valuation_date: "2025-02-01",
      market_value: "123456.78",
      valuation_purpose: "Registration",
    },
    cookie,
  );
  assert.equal(
    (await request(`/records/valuations/${v.id}`, cookie, "DELETE")).status,
    409,
  );
  const tax = await create(
    "tax_payments",
    {
      property_id: f.property.id,
      payer_owner_id: f.seller.id,
      tax_year: "2025",
      payment_date: "2025-03-01",
      amount: "1234.56",
      payment_status: "paid",
      receipt_no: randomUUID(),
    },
    cookie,
  );
  assert.equal(
    (
      await request(`/records/tax_payments/${tax.id}`, cookie, "PATCH", {
        data: { amount: "1" },
      })
    ).status,
    409,
  );
  const claim = await create(
    "encumbrances",
    {
      property_id: f.property.id,
      encumbrance_type: "mortgage",
      claimant_name: "QA Bank",
      start_date: "2025-02-01",
      status: "active",
      details: "Fictional mortgage",
    },
    cookie,
  );
  assert.equal(
    (
      await request(`/records/encumbrances/${claim.id}`, cookie, "PATCH", {
        data: { status: "released", end_date: "2025-03-01" },
      })
    ).status,
    200,
  );
  const m = await create(
    "mutations",
    {
      property_id: f.property.id,
      mutation_date: "2025-03-01",
      mutation_type: "correction",
      description: "QA clerical correction",
    },
    cookie,
  );
  assert.equal(
    (
      await request(`/records/mutations/${m.id}/review`, cookie, "POST", {
        action: "approve",
        officer_id: officer.id,
      })
    ).status,
    200,
  );
});

test("certificate snapshots include overlapping released claims and cannot reuse finalized applications", async () => {
  const cookie = await login("test-admin"),
    f = await fixture();
  const claim = await create(
    "encumbrances",
    {
      property_id: f.property.id,
      encumbrance_type: "lien",
      claimant_name: "Snapshot QA",
      start_date: "2025-01-10",
      end_date: "2025-01-20",
      status: "released",
      details: "Historical claim",
    },
    cookie,
  );
  const app = await create(
    "applications",
    {
      property_id: f.property.id,
      applicant_owner_id: f.seller.id,
      service_type: "encumbrance_certificate",
      submitted_date: "2025-02-01",
    },
    cookie,
  );
  const data = {
    certificate_no: randomUUID(),
    property_id: f.property.id,
    period_from: "2025-01-01",
    period_to: "2025-01-31",
    application_id: app.id,
  };
  const cert = await create("certificates", data, cookie, {
    officer_id: officer.id,
  });
  assert.equal(cert.snapshot_summary.claims.length, 1);
  assert.equal(cert.snapshot_summary.claims[0].id, claim.id);
  assert.equal(
    (await request(`/records/applications/${app.id}`, cookie)).body.status,
    "approved",
  );
  assert.equal(
    (
      await request("/records/certificates", cookie, "POST", {
        data: { ...data, certificate_no: randomUUID() },
        officer_id: officer.id,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/records/certificates/${cert.id}`, cookie, "PATCH", {
        data: { period_to: "2025-02-01" },
      })
    ).status,
    409,
  );
});

test("office district and property transaction links reject inconsistent changes", async () => {
  const cookie = await login("test-admin"),
    f = await fixture(),
    other = await create(
      "districts",
      { district_name: randomUUID(), state_name: "QA" },
      cookie,
    );
  assert.equal(
    (
      await request("/records/properties", cookie, "POST", {
        data: {
          survey_no: randomUUID(),
          property_type: "residential",
          area: "1",
          location: "QA",
          boundary_details: "QA",
          district_id: other.id,
          office_id: office.id,
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/records/offices/${office.id}`, cookie, "PATCH", {
        data: { district_id: other.id },
      })
    ).status,
    409,
  );
  const otherParcel = await fixture(),
    { tx } = await sale(f);
  assert.equal(
    (
      await request("/records/documents", cookie, "POST", {
        data: {
          document_no: randomUUID(),
          property_id: otherParcel.property.id,
          transaction_id: tx.id,
          document_type: "sale_deed",
          document_date: "2025-02-01",
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/records/applications", cookie, "POST", {
        data: {
          property_id: f.property.id,
          applicant_owner_id: f.seller.id,
          service_type: "registration",
          submitted_date: "2025-02-01",
          transaction_id: tx.id,
        },
      })
    ).status,
    400,
  );
});

test("officer designation and linked identity are enforced", async () => {
  const cookie = await login("test-admin"),
    f = await fixture();
  const input = {
    property_id: f.property.id,
    officer_id: valuer.id,
    survey_no: randomUUID(),
    survey_date: "2025-01-01",
    survey_area: "1",
    boundary_details: "QA",
    survey_status: "scheduled",
  };
  assert.equal(
    (await request("/records/surveys", cookie, "POST", { data: input })).status,
    400,
  );
  assert.equal(
    (
      await request(`/records/officers/${surveyor.id}`, cookie, "PATCH", {
        data: { designation: "sub_registrar" },
      })
    ).status,
    409,
  );
  const surveyCookie = await login("test-survey_officer");
  assert.equal(
    (
      await request("/records/surveys", surveyCookie, "POST", {
        data: { ...input, officer_id: surveyor.id },
      })
    ).status,
    201,
  );
  const other = await create(
    "officers",
    {
      officer_name: "Other surveyor",
      designation: "survey_officer",
      office_id: office.id,
      active: true,
    },
    cookie,
  );
  assert.equal(
    (
      await request("/records/surveys", surveyCookie, "POST", {
        data: { ...input, officer_id: other.id },
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("/records/transactions", surveyCookie, "POST", { data: {} }))
      .status,
    403,
  );
});

test("SQL payloads are treated as data in login, search, writes, IDs and resource names", async () => {
  const cookie = await login("test-admin"),
    payload = "' OR 1=1; DROP TABLE properties;--";
  assert.equal(
    (
      await request("/auth/login", undefined, "POST", {
        username: payload,
        password: payload,
      })
    ).status,
    401,
  );
  const q = await request(
    `/records/properties?q=${encodeURIComponent(payload)}`,
    cookie,
  );
  assert.equal(q.status, 200);
  assert.equal(q.body.total, 0);
  const d = await create(
    "districts",
    { district_name: payload, state_name: "SQL test" },
    cookie,
  );
  assert.equal(
    (await request(`/records/districts/${d.id}`, cookie)).body.district_name,
    payload,
  );
  assert.equal(
    (
      await request(
        `/records/properties/${encodeURIComponent(payload)}`,
        cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (await request(`/records/${encodeURIComponent(payload)}`, cookie)).status,
    404,
  );
  assert.equal(
    (await pool.query("SELECT count(*) AS n FROM properties")).rows[0].n > 0,
    true,
  );
});

test("private owner values cannot be inferred through search and accounts stay administrator-only", async () => {
  const cookie = await login("test-bank");
  assert.equal(
    (await request("/records/owners?q=private%40example.test", cookie)).body
      .total,
    0,
  );
  assert.equal((await request("/accounts", cookie)).status, 403);
  assert.equal(
    (
      await request("/accounts", await login("test-owner"), "POST", {
        username: "escalated",
        password,
        role: "administrator",
      })
    ).status,
    403,
  );
  const accounts = await request("/accounts", await login("test-admin"));
  assert.equal(
    accounts.body.some((r: any) => "password_hash" in r),
    false,
  );
});

test("audit records and ownership history cannot be written through public record endpoints", async () => {
  const cookie = await login("test-admin"),
    f = await fixture();
  assert.equal(
    (
      await request("/records/ownerships", cookie, "POST", {
        data: { property_id: f.property.id },
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("/records/audit_events", cookie, "POST", { data: {} }))
      .status,
    403,
  );
  const audits = await request(
    "/records/audit_events",
    await login("test-auditor"),
  );
  assert.equal(audits.status, 200);
  assert.equal(
    (
      await request("/records/districts", await login("test-auditor"), "POST", {
        data: {},
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/records/valuations",
        await login("test-valuation_officer"),
        "POST",
        { data: {} },
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/records/tax_payments",
        await login("test-valuation_officer"),
        "POST",
        { data: {} },
      )
    ).status,
    403,
  );
});

test("unauthenticated, forged and disabled-account sessions are rejected", async () => {
  assert.equal((await request("/records/properties")).status, 401);
  assert.equal((await request("/schema")).status, 401);
  assert.equal(
    (await request("/records/properties", "landledger_session=forged.token"))
      .status,
    401,
  );
  const cookie = await login("test-bank");
  await pool.query("UPDATE users SET active=false WHERE id=$1", [bank.id]);
  assert.equal((await request("/auth/me", cookie)).status, 401);
  await pool.query("UPDATE users SET active=true WHERE id=$1", [bank.id]);
  const response = await fetch("http://127.0.0.1:3101/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-LandLedger-Request": "1",
    },
    body: JSON.stringify({ username: "test-admin", password }),
  });
  assert.match(response.headers.get("set-cookie")!, /HttpOnly/);
  assert.match(response.headers.get("set-cookie")!, /SameSite=Strict/i);
});

test("foreign origins, malformed JSON and oversized bodies receive safe errors", async () => {
  const cookie = await login("test-admin");
  for (const [body, expected] of [
    ["{invalid", 400],
    [JSON.stringify({ data: "x".repeat(110000) }), 413],
  ] as const) {
    const response = await fetch(
      "http://127.0.0.1:3101/api/records/districts",
      {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
          "X-LandLedger-Request": "1",
        },
        body,
      },
    );
    assert.equal(response.status, expected);
    assert.equal("stack" in (await response.json()), false);
  }
  const foreign = await fetch("http://127.0.0.1:3101/api/records/districts", {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: "https://evil.example",
      "Content-Type": "application/json",
      "X-LandLedger-Request": "1",
    },
    body: JSON.stringify({ data: { district_name: "CSRF", state_name: "QA" } }),
  });
  assert.equal(foreign.status, 403);
  const safe = await fetch("http://127.0.0.1:3101/api/health");
  assert.match(
    safe.headers.get("content-security-policy")!,
    /script-src 'self'/,
  );
  assert.equal(safe.headers.get("x-content-type-options"), "nosniff");
  assert.equal(safe.headers.get("cache-control"), "no-store");
});

test("invalid form values and protected fields are rejected at the API boundary", async () => {
  const cookie = await login("test-admin");
  const base = {
    survey_no: randomUUID(),
    property_type: "residential",
    area: "1",
    location: "QA",
    boundary_details: "QA",
    district_id: district.id,
    office_id: office.id,
  };
  for (const change of [
    { area: "-1" },
    { area: "1.12345" },
    { area: "1e3" },
    { area: "NaN" },
    { property_type: "castle" },
    { location: " " },
    { office_id: "not-a-uuid" },
    { id: randomUUID() },
    { registration_status: "registered" },
    { location: "x".repeat(501) },
  ]) {
    assert.equal(
      (
        await request("/records/properties", cookie, "POST", {
          data: { ...base, ...change },
        })
      ).status,
      400,
      JSON.stringify(change),
    );
  }
  for (const data of [null, [], "text", 23, {}])
    assert.equal(
      (await request("/records/properties", cookie, "POST", { data })).status,
      400,
    );
  assert.equal(
    (
      await request("/records/officers", cookie, "POST", {
        data: {
          officer_name: "QA",
          designation: "auditor",
          office_id: office.id,
          active: "true",
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/records/owners", cookie, "POST", {
        data: {
          owner_name: "QA",
          identification_no: randomUUID(),
          address: "QA",
          email: "invalid",
        },
      })
    ).status,
    400,
  );
});

test("referenced records and finalized property data cannot be deleted or edited", async () => {
  const cookie = await login("test-admin"),
    f = await fixture();
  assert.equal(
    (await request(`/records/districts/${district.id}`, cookie, "DELETE"))
      .status,
    409,
  );
  assert.equal(
    (await request(`/records/owners/${f.seller.id}`, cookie, "DELETE")).status,
    409,
  );
  assert.equal(
    (await request(`/records/properties/${f.property.id}`, cookie, "DELETE"))
      .status,
    409,
  );
  assert.equal(
    (
      await request(`/records/properties/${f.property.id}`, cookie, "PATCH", {
        data: { area: "1" },
      })
    ).status,
    409,
  );
  const unused = await create(
    "districts",
    { district_name: randomUUID(), state_name: "QA" },
    cookie,
  );
  assert.equal(
    (
      await request(`/records/districts/${unused.id}`, cookie, "PATCH", {
        data: { state_name: "Edited QA" },
      })
    ).status,
    200,
  );
  assert.equal(
    (await request(`/records/districts/${unused.id}`, cookie, "DELETE")).status,
    200,
  );
  assert.equal(
    (await request(`/records/districts/${unused.id}`, cookie)).status,
    404,
  );
});

test("transfer chronology, overselling and identical buyer/seller are blocked", async () => {
  for (const issue of ["date", "oversell", "same-owner"]) {
    const f = await fixture(),
      { tx } = await sale(f, issue === "oversell" ? "1" : "0.5");
    if (issue === "date")
      await pool.query(
        "UPDATE transactions SET transaction_date='2024-12-01' WHERE id=$1",
        [tx.id],
      );
    if (issue === "oversell")
      await pool.query(
        "UPDATE ownerships SET share='0.5' WHERE property_id=$1",
        [f.property.id],
      );
    if (issue === "same-owner")
      await pool.query(
        "UPDATE transaction_parties SET owner_id=$1 WHERE transaction_id=$2 AND role='transferee'",
        [f.seller.id, tx.id],
      );
    await assert.rejects(() =>
      transaction((c) => approveTransfer(c, actor, tx.id, officer.id)),
    );
    assert.equal(
      (await pool.query("SELECT status FROM transactions WHERE id=$1", [tx.id]))
        .rows[0].status,
      "pending",
    );
  }
});

test("inheritance and gift use their matching deeds and preserve exact ownership", async () => {
  for (const kind of ["inheritance", "gift"]) {
    const f = await fixture(),
      { tx, doc } = await sale(f);
    await pool.query(
      "UPDATE transactions SET transaction_type=$1,consideration=0 WHERE id=$2",
      [kind, tx.id],
    );
    await assert.rejects(
      () => transaction((c) => approveTransfer(c, actor, tx.id, officer.id)),
      /matching deed/,
    );
    await pool.query("UPDATE documents SET document_type=$1 WHERE id=$2", [
      `${kind}_deed`,
      doc.id,
    ]);
    await transaction((c) => approveTransfer(c, actor, tx.id, officer.id));
    assert.equal(
      (
        await pool.query(
          "SELECT owner_id FROM ownerships WHERE property_id=$1 AND valid_to IS NULL",
          [f.property.id],
        )
      ).rows[0].owner_id,
      f.buyer.id,
    );
  }
});

test("registrars from another office and rejected linked applications cannot be approved", async () => {
  const cookie = await login("test-admin"),
    f = await fixture(),
    { tx } = await sale(f);
  const otherOffice = await create(
    "offices",
    {
      office_name: "Other QA",
      office_code: randomUUID(),
      district_id: district.id,
      address: "QA",
    },
    cookie,
  );
  const otherRegistrar = await create(
    "officers",
    {
      officer_name: "Other registrar",
      designation: "sub_registrar",
      office_id: otherOffice.id,
      active: true,
    },
    cookie,
  );
  assert.equal(
    (
      await request(`/records/transactions/${tx.id}/review`, cookie, "POST", {
        action: "approve",
        officer_id: otherRegistrar.id,
      })
    ).status,
    400,
  );
  const app = await create(
    "applications",
    {
      property_id: f.property.id,
      applicant_owner_id: f.seller.id,
      transaction_id: tx.id,
      service_type: "transfer",
      submitted_date: "2025-02-01",
    },
    cookie,
  );
  assert.equal(
    (
      await request(
        `/records/transactions/${tx.id}/review`,
        await login("test-sub_registrar"),
        "POST",
        { action: "reject" },
      )
    ).status,
    200,
  );
  assert.equal(
    (await request(`/records/applications/${app.id}`, cookie)).body.status,
    "rejected",
  );
  assert.equal(
    (
      await request(`/records/transactions/${tx.id}/review`, cookie, "POST", {
        action: "approve",
        officer_id: officer.id,
      })
    ).status,
    409,
  );
});

test("oversized, extra and unauthorized uploads are blocked, downloads require access", async () => {
  const f = await fixture(),
    { doc } = await sale(f),
    cookie = await login("test-admin");
  const large = new FormData();
  large.append(
    "file",
    new Blob(["%PDF-", new Uint8Array(10 * 1024 * 1024)]),
    "large.pdf",
  );
  const headers = { Cookie: cookie, "X-LandLedger-Request": "1" };
  assert.equal(
    (
      await fetch(`http://127.0.0.1:3101/api/documents/${doc.id}/file`, {
        method: "POST",
        headers,
        body: large,
      })
    ).status,
    413,
  );
  const extra = new FormData();
  extra.append("wrongField", new Blob(["%PDF-"]), "wrong.pdf");
  assert.equal(
    (
      await fetch(`http://127.0.0.1:3101/api/documents/${doc.id}/file`, {
        method: "POST",
        headers,
        body: extra,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(`http://127.0.0.1:3101/api/documents/${doc.id}/file`, {
        headers: { Cookie: await login("test-owner") },
      })
    ).status,
    404,
  );
  assert.equal(
    (await fetch(`http://127.0.0.1:3101/api/documents/${doc.id}/file`)).status,
    401,
  );
  const bad = new FormData();
  bad.append("file", new Blob(["%PDF-"]), "test.pdf");
  assert.equal(
    (
      await fetch(`http://127.0.0.1:3101/api/documents/${doc.id}/file`, {
        method: "POST",
        headers: {
          Cookie: await login("test-bank"),
          "X-LandLedger-Request": "1",
        },
        body: bad,
      })
    ).status,
    403,
  );
});

test("live ER metadata agrees with every table, FK and nullable reference in approved SQL", async () => {
  const result = await request("/schema", await login("test-admin"));
  assert.equal(result.status, 200);
  const schema = result.body;
  const sql = await readFile(
    new URL("../../server/schema.sql", import.meta.url),
    "utf8",
  );
  const expected: string[] = [];
  const tables = [
    ...sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n\);/g),
  ];
  assert.equal(tables.length, 18);
  assert.equal(schema.tables.length, 18);
  for (const [, name, body] of tables) {
    assert.equal(
      schema.tables.some((t: any) => t.name === name),
      true,
    );
    for (const [, column, required, target, targetColumn] of body.matchAll(
      /(\w+) UUID (NOT NULL )?REFERENCES (\w+)\((\w+)\)/g,
    )) {
      expected.push(`${name}.${column}->${target}.${targetColumn}`);
      const edge = schema.relations.find(
        (r: any) => r.source === name && r.sourceColumns[0] === column,
      );
      assert.ok(edge, `${name}.${column}`);
      assert.equal(edge.optional, !required);
      assert.equal(edge.childMaximum, "N");
    }
  }
  assert.equal(expected.length, 37);
  assert.deepEqual(
    schema.relations
      .map(
        (r: any) =>
          `${r.source}.${r.sourceColumns[0]}->${r.target}.${r.targetColumns[0]}`,
      )
      .sort(),
    expected.sort(),
  );
  assert.match(
    schema.tables.find((t: any) => t.name === "ownerships").ddl,
    /UNIQUE INDEX[\s\S]*WHERE/,
  );
  const actualHash = (
    await pool.query("SELECT password_hash FROM users LIMIT 1")
  ).rows[0].password_hash;
  assert.equal(JSON.stringify(schema).includes(actualHash), false);
});

test("every one of the 37 foreign keys rejects a missing parent in the database", async () => {
  const { readSchema } = await import("../../server/catalog.js");
  const schema = await readSchema();
  for (const edge of schema.relations) {
    const row = (
      await pool.query(
        `SELECT id FROM ${edge.source} ORDER BY ${edge.sourceColumns[0]} IS NULL LIMIT 1`,
      )
    ).rows[0];
    assert.ok(row, `Fixture exists for ${edge.source}`);
    await assert.rejects(
      () =>
        transaction((c) =>
          c.query(
            `UPDATE ${edge.source} SET ${edge.sourceColumns[0]}=$1 WHERE id=$2`,
            [randomUUID(), row.id],
          ),
        ),
      (e: any) => e.code === "23503",
      `${edge.source}.${edge.sourceColumns[0]}`,
    );
  }
});

test("backdated completed surveys preserve the latest boundary and future completion is rejected", async () => {
  const cookie = await login("test-admin"),
    f = await fixture();
  const data = {
    property_id: f.property.id,
    officer_id: surveyor.id,
    survey_no: randomUUID(),
    survey_date: "2025-06-01",
    survey_area: "300",
    boundary_details: "Latest boundary",
    survey_status: "completed",
  };
  await create("surveys", data, cookie);
  await create(
    "surveys",
    {
      ...data,
      survey_no: randomUUID(),
      survey_date: "2025-02-01",
      survey_area: "100",
      boundary_details: "Old boundary",
    },
    cookie,
  );
  const prop = await request(`/records/properties/${f.property.id}`, cookie);
  assert.equal(prop.body.area, "300.0000");
  assert.equal(prop.body.boundary_details, "Latest boundary");
  assert.equal(
    (
      await request("/records/surveys", cookie, "POST", {
        data: { ...data, survey_date: "2199-01-01" },
      })
    ).status,
    400,
  );
});
test("owner transaction submission links the existing application without creating a duplicate", async () => {
  const cookie = await login("test-owner");
  const prop = await create(
    "properties",
    {
      survey_no: randomUUID(),
      property_type: "commercial",
      area: "80",
      location: "Portal QA",
      boundary_details: "QA",
      district_id: district.id,
      office_id: office.id,
    },
    cookie,
  );
  const tx = await create(
    "transactions",
    {
      property_id: prop.id,
      office_id: office.id,
      transaction_type: "registration",
      transaction_date: "2025-01-01",
      consideration: "0",
    },
    cookie,
  );
  const applications = await request(
    `/records/applications?property_id=${prop.id}`,
    cookie,
  );
  assert.equal(applications.body.total, 1);
  assert.equal(applications.body.rows[0].transaction_id, tx.id);
});
test("account creation validates passwords, roles and required linked profiles", async () => {
  const cookie = await login("test-admin");
  for (const input of [
    { username: "qa-weak", password: "short", role: "administrator" },
    { username: "qa-owner", password, role: "owner" },
    { username: "qa-badrole", password, role: "root" },
    {
      username: "qa-survey",
      password,
      role: "survey_officer",
      officer_id: valuer.id,
    },
  ]) {
    assert.equal(
      (await request("/accounts", cookie, "POST", input)).status,
      400,
      JSON.stringify(input),
    );
  }
  const valid = await request("/accounts", cookie, "POST", {
    username: "qa-valid-bank",
    password,
    role: "bank_verifier",
  });
  assert.equal(valid.status, 201);
  assert.equal("password_hash" in valid.body, false);
  assert.equal(
    (
      await request("/accounts", cookie, "POST", {
        username: "qa-valid-bank",
        password,
        role: "bank_verifier",
      })
    ).status,
    409,
  );
});
test("database checks and active ownership uniqueness hold outside the API", async () => {
  const f = await fixture();
  for (const [table, column, value] of [
    ["properties", "area", "0"],
    ["properties", "property_type", "unknown"],
    ["ownerships", "share", "1.5"],
    ["transactions", "consideration", "-1"],
  ]) {
    const id =
      table === "properties"
        ? f.property.id
        : table === "transactions"
          ? f.initial.id
          : (
              await pool.query(
                "SELECT id FROM ownerships WHERE property_id=$1",
                [f.property.id],
              )
            ).rows[0].id;
    await assert.rejects(
      () =>
        transaction((c) =>
          c.query(`UPDATE ${table} SET ${column}=$1 WHERE id=$2`, [value, id]),
        ),
      (e: any) => e.code === "23514",
    );
  }
  await assert.rejects(
    () =>
      transaction((c) =>
        insert(c, "ownerships", {
          property_id: f.property.id,
          owner_id: f.seller.id,
          share: "0.5",
          valid_from: "2025-02-01",
          source_transaction_id: f.initial.id,
        }),
      ),
    (e: any) => e.code === "23505",
  );
});
test("search resolves related names and bounds pagination", async () => {
  const cookie = await login("test-admin");
  const result = await request(
    "/records/properties?q=Test%20District&limit=999&page=0",
    cookie,
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.limit, 100);
  assert.equal(result.body.page, 1);
  assert.equal(result.body.total > 0, true);
  const invalid = await request("/records/transactions?status=invalid", cookie);
  assert.equal(invalid.status, 400);
});

test("owners cannot approve registrations or set privileged fields", async () => {
  const cookie = await login("test-owner"),
    f = await fixture(),
    { tx } = await sale(f);
  assert.equal(
    (
      await request(`/records/transactions/${tx.id}/review`, cookie, "POST", {
        action: "approve",
        officer_id: officer.id,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/records/properties", cookie, "POST", {
        data: { registration_status: "registered" },
      })
    ).status,
    400,
  );
});
test("login throttling blocks repeated guessing attempts", async () => {
  let denied = false,
    throttled = false;
  for (let n = 0; n < 31; n++) {
    const response = await request("/auth/login", undefined, "POST", {
      username: "unknown-test-user",
      password: "wrong",
    });
    denied ||= response.status === 401;
    throttled ||= response.status === 429;
  }
  assert.equal(denied, true);
  assert.equal(throttled, true);
});

test("replacing one document preserves a file still referenced by another document", async () => {
  const cookie = await login("test-admin"),
    f = await fixture(),
    first = await sale(f),
    second = await sale(await fixture());
  for (const doc of [first.doc, second.doc])
    await pool.query(
      "UPDATE documents SET verification_status='pending',verifying_officer_id=NULL,verified_date=NULL,file_key=NULL WHERE id=$1",
      [doc.id],
    );
  await uploadPdf(first.doc.id, cookie);
  await pool.query(
    "UPDATE documents SET file_key=d.file_key,original_filename=d.original_filename,media_type=d.media_type,file_size=d.file_size,sha256=d.sha256 FROM documents d WHERE documents.id=$1 AND d.id=$2",
    [second.doc.id, first.doc.id],
  );
  await uploadPdf(first.doc.id, cookie);
  const response = await fetch(
    `http://127.0.0.1:3101/api/documents/${second.doc.id}/file`,
    { headers: { Cookie: cookie } },
  );
  assert.equal(response.status, 200);
  assert.match(await response.text(), /^%PDF-/);
  assert.match(response.headers.get("content-disposition")!, /^attachment/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("survey and valuation officers cannot maintain a parcel from another registration office", async () => {
  const cookie = await login("test-admin"),
    f = await fixture();
  const otherOffice = await create(
    "offices",
    {
      office_name: "Other field office",
      office_code: randomUUID(),
      district_id: district.id,
      address: "QA",
    },
    cookie,
  );
  for (const [key, designation] of [
    ["surveys", "survey_officer"],
    ["valuations", "valuation_officer"],
  ]) {
    const profile = await create(
      "officers",
      {
        officer_name: "Other field officer",
        designation,
        office_id: otherOffice.id,
        active: true,
      },
      cookie,
    );
    const data =
      key === "surveys"
        ? {
            property_id: f.property.id,
            officer_id: profile.id,
            survey_no: randomUUID(),
            survey_date: "2025-01-01",
            survey_area: "20",
            boundary_details: "QA",
            survey_status: "completed",
          }
        : {
            property_id: f.property.id,
            officer_id: profile.id,
            valuation_date: "2025-01-01",
            market_value: "20",
            valuation_purpose: "QA",
          };
    assert.equal(
      (await request(`/records/${key}`, cookie, "POST", { data })).status,
      400,
    );
  }
});
