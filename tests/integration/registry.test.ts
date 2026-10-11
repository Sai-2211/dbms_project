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
const { hashPassword, verifyPassword } = await import("../../server/auth.js");
const { resourceMap } = await import("../../server/resources.js");
const { initializeAdministrator, administratorUsername } =
  await import("../../server/bootstrap-admin.js");
let child: ChildProcess | undefined;
const deploymentChildren = new Set<ChildProcess>();
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
  for (const process of deploymentChildren) {
    if (process.exitCode !== null || process.signalCode !== null) continue;
    const exited = new Promise<void>((resolve) =>
      process.once("exit", () => resolve()),
    );
    process.kill("SIGTERM");
    await exited;
  }
  if (child && !child.killed) {
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => child!.once("exit", () => resolve()));
  }
  await pool.end();
  await control.query(`DROP DATABASE IF EXISTS ${name} CASCADE`);
  await control.end();
  if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
});

test("cloud administrator setup creates an audited login, preserves existing passwords unless reset, and recovers access", async () => {
  const first = "PrivateAdmin'\"தமிழ்@2026";
  const changed = "PrivateChangedAdmin@2026";
  assert.equal(await initializeAdministrator(pool, first), "created");
  const initial = (
    await pool.query("SELECT * FROM users WHERE username=$1", [
      administratorUsername,
    ])
  ).rows[0];
  assert.equal(initial.role, "administrator");
  assert.equal(verifyPassword(first, initial.password_hash), true);
  assert.equal(initial.owner_id, null);
  assert.equal(initial.officer_id, null);
  const login = (password: string) =>
    fetch("http://127.0.0.1:3101/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-LandLedger-Request": "1",
        Origin: "http://127.0.0.1:3101",
      },
      body: JSON.stringify({ username: administratorUsername, password }),
    });
  try {
    assert.equal((await login(first)).status, 200);
    assert.equal(await initializeAdministrator(pool, changed), "exists");
    assert.equal((await login(first)).status, 200);
    assert.equal((await login(changed)).status, 401);
    await pool.query("UPDATE users SET active=false WHERE id=$1", [initial.id]);
    assert.equal((await login(first)).status, 401);
    assert.equal(await initializeAdministrator(pool, changed, true), "reset");
    assert.equal((await login(changed)).status, 200);
    assert.equal((await login(first)).status, 401);
    const events = (
      await pool.query(
        "SELECT action,summary FROM audit_events WHERE actor_id=$1 ORDER BY occurred_at",
        [initial.id],
      )
    ).rows;
    assert.deepEqual(
      events.map((event) => event.action),
      ["create", "reset_password"],
    );
    const serialized = JSON.stringify(events);
    assert.equal(serialized.includes(first), false);
    assert.equal(serialized.includes(changed), false);
    assert.equal(serialized.includes(initial.password_hash), false);
  } finally {
    await pool.query("DELETE FROM audit_events WHERE actor_id=$1", [
      initial.id,
    ]);
    await pool.query("DELETE FROM users WHERE id=$1", [initial.id]);
  }
});

test("administrator setup does not elevate another role or replace an account after concurrent creation", async () => {
  const first = "ConcurrentPrivateAdmin@2026";
  const second = "OtherConcurrentPrivateAdmin@2026";
  const other = (
    await pool.query(
      "INSERT INTO users(username,password_hash,role) VALUES($1,$2,'bank_verifier') RETURNING id,password_hash",
      [administratorUsername, hashPassword(first)],
    )
  ).rows[0];
  try {
    await assert.rejects(
      initializeAdministrator(pool, second, true),
      /another role/,
    );
    assert.deepEqual(
      (
        await pool.query("SELECT role,password_hash FROM users WHERE id=$1", [
          other.id,
        ])
      ).rows[0],
      { role: "bank_verifier", password_hash: other.password_hash },
    );
  } finally {
    await pool.query("DELETE FROM users WHERE id=$1", [other.id]);
  }
  try {
    const results = await Promise.all([
      initializeAdministrator(pool, first),
      initializeAdministrator(pool, second),
    ]);
    assert.deepEqual(results.slice().sort(), ["created", "exists"]);
    const users = (
      await pool.query("SELECT password_hash FROM users WHERE username=$1", [
        administratorUsername,
      ])
    ).rows;
    assert.equal(users.length, 1);
    const winner = results[0] === "created" ? first : second;
    assert.equal(verifyPassword(winner, users[0].password_hash), true);
  } finally {
    await pool.query(
      "DELETE FROM audit_events WHERE actor_id IN (SELECT id FROM users WHERE username=$1)",
      [administratorUsername],
    );
    await pool.query("DELETE FROM users WHERE username=$1", [
      administratorUsername,
    ]);
  }
});

test("Render proxy mode keeps client login limits separate and rejects spoofed outer forwarded addresses", async () => {
  const origin = "http://127.0.0.1:3102";
  const server = spawn(
    process.execPath,
    ["--import", "tsx", "server/index.ts"],
    {
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: "3102",
        NODE_ENV: "development",
        RENDER: "true",
        APP_ORIGIN: "",
        RENDER_EXTERNAL_URL: origin,
        UPLOAD_DIR: uploadDir,
      },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  deploymentChildren.add(server);
  let stderr = "";
  server.stderr?.on("data", (bytes) => {
    stderr += bytes.toString();
  });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        if ((await fetch(`${origin}/api/health`)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(
      ready,
      true,
      "API starts using Render's external URL fallback",
    );
    const headers = {
      "Content-Type": "application/json",
      "X-LandLedger-Request": "1",
      Origin: origin,
    };
    const login = (ip: string, username = "unknown-client") =>
      fetch(`${origin}/api/auth/login`, {
        method: "POST",
        headers: { ...headers, "X-Forwarded-For": ip },
        body: JSON.stringify({
          username,
          password: username === "test-admin" ? password : "incorrect",
        }),
      });
    for (let attempt = 0; attempt < 30; attempt++)
      assert.equal((await login("198.51.100.44")).status, 401);
    assert.equal((await login("198.51.100.44")).status, 429);
    // Trust only the closest ingress hop, not the client-controlled leftmost IP.
    assert.equal((await login("203.0.113.250, 198.51.100.44")).status, 429);
    const valid = await login("198.51.100.45", "test-admin");
    assert.equal(valid.status, 200, "A different client can still sign in");
    assert.match(valid.headers.get("set-cookie")!, /HttpOnly/);
    const cookie = valid.headers.get("set-cookie")!.split(";")[0];
    assert.equal(
      (await fetch(`${origin}/api/schema`, { headers: { Cookie: cookie } }))
        .status,
      200,
    );
    const foreign = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { ...headers, Origin: "https://foreign.example.test" },
      body: JSON.stringify({ username: "test-admin", password }),
    });
    assert.equal(foreign.status, 403);
    assert.doesNotMatch(stderr, /ERR_ERL_/);
  } finally {
    if (server.exitCode === null && server.signalCode === null) {
      const exited = new Promise<void>((resolve) =>
        server.once("exit", () => resolve()),
      );
      server.kill("SIGTERM");
      await exited;
    }
    deploymentChildren.delete(server);
  }
});

test(
  "Render demo bootstrap creates private accounts and document files, is idempotent, and refuses unrelated records",
  { timeout: 60000 },
  async () => {
    const demoName = `${name}_demo`;
    const demoUrl = new URL(base!);
    demoUrl.pathname = `/${demoName}`;
    const demoPool = new pg.Pool({ connectionString: demoUrl.toString() });
    const demoUploads = await mkdtemp(
      path.join(tmpdir(), "landledger-demo-test-"),
    );
    const privatePassword = "PrivateBootstrapTest@2026";
    const env = {
      ...process.env,
      RENDER: "true",
      NODE_ENV: "production",
      DATABASE_URL: demoUrl.toString(),
      UPLOAD_DIR: demoUploads,
      DEMO_ADMIN_PASSWORD: privatePassword,
    };
    const run = (script: string) =>
      new Promise<{ code: number | null; output: string }>(
        (resolve, reject) => {
          const process = spawn(
            globalThis.process.execPath,
            ["--import", "tsx", script],
            {
              env,
              stdio: ["ignore", "pipe", "pipe"],
            },
          );
          deploymentChildren.add(process);
          let output = "";
          process.stdout?.on("data", (data) => {
            output += data.toString();
          });
          process.stderr?.on("data", (data) => {
            output += data.toString();
          });
          const timer = setTimeout(() => process.kill("SIGTERM"), 20000);
          process.once("error", (error) => {
            clearTimeout(timer);
            deploymentChildren.delete(process);
            reject(error);
          });
          process.once("close", (code) => {
            clearTimeout(timer);
            deploymentChildren.delete(process);
            resolve({ code, output });
          });
        },
      );
    try {
      await control.query(`CREATE DATABASE ${demoName}`);
      await demoPool.query(
        await readFile(
          new URL("../../server/schema.sql", import.meta.url),
          "utf8",
        ),
      );
      const ordinarySeed = await run("server/seed.ts");
      assert.equal(ordinarySeed.code, 1);
      assert.match(ordinarySeed.output, /Demo seed is disabled in production/);
      const initial = await run("server/bootstrap-demo.ts");
      assert.equal(initial.code, 0, initial.output);
      assert.doesNotMatch(initial.output, new RegExp(privatePassword));
      const counts = (
        await demoPool.query(
          "SELECT (SELECT count(*) FROM properties) AS properties, (SELECT count(*) FROM users) AS users",
        )
      ).rows[0];
      assert.equal(Number(counts.properties), 24);
      assert.equal(Number(counts.users), 7);
      const users = (
        await demoPool.query(
          "SELECT username,password_hash FROM users ORDER BY username",
        )
      ).rows;
      for (const user of users) {
        assert.equal(verifyPassword(privatePassword, user.password_hash), true);
        assert.equal(
          verifyPassword("LandLedger@2026", user.password_hash),
          false,
        );
      }
      const documents = (
        await demoPool.query(
          "SELECT file_key FROM documents WHERE file_key IS NOT NULL",
        )
      ).rows;
      assert.ok(documents.length > 0);
      for (const document of documents) {
        const pdf = await readFile(path.join(demoUploads, document.file_key));
        assert.match(pdf.toString(), /^%PDF-/);
        assert.match(pdf.toString(), /Fictional sample document/);
      }
      const repeated = await run("server/bootstrap-demo.ts");
      assert.equal(repeated.code, 0, repeated.output);
      assert.match(repeated.output, /Existing data was left unchanged/);
      assert.deepEqual(
        (
          await demoPool.query(
            "SELECT username,password_hash FROM users ORDER BY username",
          )
        ).rows,
        users,
      );
      // Only this disposable fixture is changed to exercise refusal of unrelated data.
      await demoPool.query(
        "UPDATE properties SET survey_no='QA-UNRELATED' WHERE survey_no='DEMO-1001'",
      );
      const unrelated = await run("server/bootstrap-demo.ts");
      assert.equal(unrelated.code, 1);
      assert.match(unrelated.output, /Refusing to seed a non-empty registry/);
      assert.equal(
        Number(
          (await demoPool.query("SELECT count(*) AS count FROM properties"))
            .rows[0].count,
        ),
        24,
      );
      assert.deepEqual(
        (
          await demoPool.query(
            "SELECT username,password_hash FROM users ORDER BY username",
          )
        ).rows,
        users,
      );
    } finally {
      await demoPool.end();
      await control.query(`DROP DATABASE IF EXISTS ${demoName} CASCADE`);
      await rm(demoUploads, { recursive: true, force: true });
    }
  },
);

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

test("public role migration upgrades legacy checks twice without changing existing accounts or relationships", async () => {
  const { upgradePublicRole } =
    await import("../../server/upgrade-public-role.js");
  const before = (await pool.query("SELECT * FROM users ORDER BY id")).rows;
  await pool.query(
    "ALTER TABLE users ADD CONSTRAINT check_role CHECK(role IN ('administrator','owner','survey_officer','valuation_officer','sub_registrar','bank_verifier','auditor'))",
  );
  await pool.query(`ALTER TABLE users ADD CONSTRAINT check_role_owner_id_officer_id_role_officer_id_owner_id_role_owner_id_officer_id
    CHECK((role='owner' AND owner_id IS NOT NULL AND officer_id IS NULL)
    OR(role IN ('survey_officer','valuation_officer','sub_registrar','auditor') AND officer_id IS NOT NULL AND owner_id IS NULL)
    OR(role IN ('administrator','bank_verifier') AND owner_id IS NULL AND officer_id IS NULL))`);
  await pool.query("ALTER TABLE users DROP CONSTRAINT users_role_allowed");
  await pool.query("ALTER TABLE users DROP CONSTRAINT users_role_profile");
  await upgradePublicRole(pool);
  await upgradePublicRole(pool);
  assert.deepEqual(
    (await pool.query("SELECT * FROM users ORDER BY id")).rows,
    before,
  );
  const checks = (await pool.query("SHOW CONSTRAINTS FROM users")).rows.filter(
    (r) => r.constraint_type === "CHECK",
  );
  assert.equal(checks.length, 2);
  assert(
    checks.every((r) => r.validated && r.details.includes("public_viewer")),
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::INT AS n FROM information_schema.referential_constraints WHERE constraint_schema='public'",
      )
    ).rows[0].n,
    "37",
  );
});

let publicCookie = "";
let publicProperty: Record<string, any>;
let pendingPublic: Record<string, any>;
let rejectedPublic: Record<string, any>;
let privateDistrictId = "";
const publicSurvey = `PUBLIC-${randomUUID()}`;
const hiddenSentinel = `PRIVATE-${randomUUID()}`;
test("administrator creates public accounts, while visitors cannot register or choose a privileged role at login", async () => {
  assert.equal(
    (
      await request("/accounts", undefined, "POST", {
        username: "intruder",
        password,
        role: "administrator",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request("/auth/register", undefined, "POST", {
        username: "intruder",
        password,
      })
    ).status,
    401,
  );
  const adminCookie = await login("test-admin");
  const created = await request("/accounts", adminCookie, "POST", {
    username: "test-public",
    password,
    role: "public_viewer",
    owner_id: ownerUser.owner_id,
    officer_id: officer.id,
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.role, "public_viewer");
  assert.equal(created.body.owner_id, null);
  assert.equal(created.body.officer_id, null);
  assert.equal(created.body.password_hash, undefined);
  const wrongPortal = await request("/auth/login", undefined, "POST", {
    username: "test-public",
    password,
    portal: "department",
  });
  assert.equal(wrongPortal.status, 403);
  assert.equal(wrongPortal.cookie, undefined);
  assert.equal(
    (
      await request("/auth/login", undefined, "POST", {
        username: "test-admin",
        password,
        portal: "public",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/auth/login", undefined, "POST", {
        username: "test-public",
        password,
        portal: "administrator",
      })
    ).status,
    400,
  );
  const signedIn = await request("/auth/login", undefined, "POST", {
    username: "test-public",
    password,
    portal: "public",
    role: "administrator",
  });
  assert.equal(signedIn.status, 200);
  assert.equal(signedIn.body.role, "public_viewer");
  publicCookie = signedIn.cookie!;
  assert.equal(
    (await request("/auth/me", publicCookie)).body.role,
    "public_viewer",
  );
});

test("public directory, detail, counts and search expose registered property projections only", async () => {
  const data = {
    district_id: district.id,
    office_id: office.id,
    property_type: "residential",
    area: "123.4500",
    location: "Public test location",
    boundary_details: hiddenSentinel,
  };
  await transaction(async (c) => {
    const privateDistrict = await insert(c, "districts", {
      district_name: hiddenSentinel,
      state_name: "Private pending district",
    });
    privateDistrictId = privateDistrict.id;
    const privateOffice = await insert(c, "offices", {
      district_id: privateDistrict.id,
      office_code: randomUUID(),
      office_name: hiddenSentinel,
      address: hiddenSentinel,
    });
    await insert(c, "properties", {
      ...data,
      district_id: privateDistrict.id,
      office_id: privateOffice.id,
      survey_no: hiddenSentinel,
      registration_status: "pending",
    });
    publicProperty = await insert(c, "properties", {
      ...data,
      survey_no: publicSurvey,
      registration_status: "registered",
      registration_date: "2025-01-01",
    });
    pendingPublic = await insert(c, "properties", {
      ...data,
      survey_no: `PENDING-${hiddenSentinel}`,
      registration_status: "pending",
    });
    rejectedPublic = await insert(c, "properties", {
      ...data,
      survey_no: `REJECTED-${hiddenSentinel}`,
      registration_status: "rejected",
    });
    await insert(c, "encumbrances", {
      property_id: publicProperty.id,
      encumbrance_type: "mortgage",
      claimant_name: hiddenSentinel,
      start_date: "2025-01-01",
      status: "active",
      details: hiddenSentinel,
    });
  });
  const expectedFields = [
    "id",
    "survey_no",
    "property_type",
    "area",
    "location",
    "district_name",
    "state_name",
    "office_name",
    "registration_date",
    "registration_status",
    "has_active_encumbrance",
  ].sort();
  const result = await request(
    `/public/properties?q=${publicSurvey}`,
    publicCookie,
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.total, 1);
  assert.equal(result.body.rows.length, 1);
  const row = result.body.rows[0];
  assert.deepEqual(Object.keys(row).sort(), expectedFields);
  assert.equal(row.area, "123.4500");
  assert.equal(row.has_active_encumbrance, true);
  assert(!JSON.stringify(row).includes(hiddenSentinel));
  const detail = await request(
    `/public/properties/${publicProperty.id}`,
    publicCookie,
  );
  assert.deepEqual(Object.keys(detail.body).sort(), expectedFields);
  assert.equal(detail.body.survey_no, publicSurvey);
  for (const id of [pendingPublic.id, rejectedPublic.id, randomUUID()])
    assert.equal(
      (await request(`/public/properties/${id}`, publicCookie)).status,
      404,
    );
  assert.equal(
    (await request(`/public/properties?q=${hiddenSentinel}`, publicCookie)).body
      .total,
    0,
  );
  assert.equal(
    (
      await request(
        `/public/properties?q=${encodeURIComponent("' OR 1=1; DROP TABLE users; --")}`,
        publicCookie,
      )
    ).body.total,
    0,
  );
  assert.equal(
    (await request("/public/properties?q=%25", publicCookie)).body.total,
    0,
  );
  const overview = await request("/public/overview", publicCookie);
  assert.equal(overview.status, 200);
  const registeredCount = Number(
    (
      await pool.query(
        "SELECT count(*) AS n FROM properties WHERE registration_status='registered'",
      )
    ).rows[0].n,
  );
  assert.equal(overview.body.total, registeredCount);
  assert.equal(
    overview.body.types.reduce((n: number, r: any) => n + r.count, 0),
    registeredCount,
  );
  assert(!JSON.stringify(overview.body).includes(hiddenSentinel));
  assert(!overview.body.districts.some((d: any) => d.id === privateDistrictId));
  assert.equal(
    (
      await request(
        `/public/properties?district=${privateDistrictId}`,
        publicCookie,
      )
    ).body.total,
    0,
  );
  assert.equal((await request("/public/properties", undefined)).status, 401);
  assert.equal(
    (await request("/public/properties", await login("test-owner"))).status,
    403,
  );
});

test("public accounts cannot access any department data, documents, schema or mutating endpoint", async () => {
  for (const endpoint of [
    "/schema",
    "/metadata",
    "/dashboard",
    "/accounts",
    "/lookups/owners",
    "/records/properties",
    `/records/properties/${publicProperty.id}`,
    "/records/owners",
    "/records/audit_events",
    `/files/${randomUUID()}`,
    `/documents/${randomUUID()}/file`,
  ]) {
    assert.equal((await request(endpoint, publicCookie)).status, 403, endpoint);
  }
  for (const [method, endpoint] of [
    ["POST", "/accounts"],
    ["POST", "/records/properties"],
    ["PATCH", `/records/properties/${publicProperty.id}`],
    ["DELETE", `/records/properties/${publicProperty.id}`],
    ["POST", `/actions/transactions/${randomUUID()}/approve`],
    ["POST", "/public/properties"],
    ["DELETE", `/public/properties/${publicProperty.id}`],
  ]) {
    assert.equal(
      (
        await request(endpoint, publicCookie, method, {
          role: "administrator",
          registration_status: "registered",
        })
      ).status,
      403,
      endpoint,
    );
  }
  assert.equal(
    (
      await request("/accounts", await login("test-owner"), "POST", {
        username: "owner-created",
        password,
        role: "public_viewer",
      })
    ).status,
    403,
  );
  const original = (
    await pool.query("SELECT * FROM properties WHERE id=$1", [
      publicProperty.id,
    ])
  ).rows[0];
  assert.equal(original.survey_no, publicSurvey);
});

test("public search validates types, size, pagination and allowed fields without leaking private filters", async () => {
  for (const query of [
    "q[x]=abc",
    "q=a&q=b",
    `q=${"a".repeat(201)}`,
    "district=not-a-uuid",
    "page=0",
    "page=-1",
    "page=1.5",
    "page=1000000",
    "limit=0",
    "limit=51",
    "limit=NaN",
    "owner_id=" + ownerUser.owner_id,
    "status=pending",
    "sort=password_hash",
  ]) {
    assert.equal(
      (await request(`/public/properties?${query}`, publicCookie)).status,
      400,
      query,
    );
  }
  const page = await request(
    `/public/properties?q=${publicSurvey}&district=${district.id}&page=2&limit=1`,
    publicCookie,
  );
  assert.equal(page.status, 200);
  assert.equal(page.body.total, 1);
  assert.deepEqual(page.body.rows, []);
  assert.equal(
    (await request("/public/properties/not-a-uuid", publicCookie)).status,
    400,
  );
});

test("database rejects unknown roles and public users linked to private profiles", async () => {
  for (const [role, linked] of [
    ["public_viewer", ownerUser.owner_id],
    ["superuser", null],
  ]) {
    await assert.rejects(
      () =>
        pool.query(
          "INSERT INTO users(username,password_hash,role,owner_id) VALUES($1,$2,$3,$4)",
          [`invalid-${randomUUID()}`, hashPassword(password), role, linked],
        ),
      (e: any) => e.code === "23514",
    );
  }
});

test("public encumbrance indicator respects date range and never discloses claimants", async () => {
  await pool.query(
    "UPDATE encumbrances SET end_date='2025-01-02' WHERE property_id=$1",
    [publicProperty.id],
  );
  assert.equal(
    (await request(`/public/properties/${publicProperty.id}`, publicCookie))
      .body.has_active_encumbrance,
    false,
  );
  await pool.query(
    "UPDATE encumbrances SET start_date='2199-01-01',end_date=NULL WHERE property_id=$1",
    [publicProperty.id],
  );
  assert.equal(
    (await request(`/public/properties/${publicProperty.id}`, publicCookie))
      .body.has_active_encumbrance,
    false,
  );
  await pool.query(
    "UPDATE encumbrances SET start_date='2025-01-01',status='released' WHERE property_id=$1",
    [publicProperty.id],
  );
  assert.equal(
    (await request(`/public/properties/${publicProperty.id}`, publicCookie))
      .body.has_active_encumbrance,
    false,
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
