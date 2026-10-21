import "dotenv/config";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { Actor } from "../../server/resources.js";
const connection = process.env.DATABASE_URL!;
const name = `landledger_test_provision_${Date.now()}_${process.pid}`;
const control = new pg.Pool({ connectionString: connection });
const url = new URL(connection);
url.pathname = `/${name}`;
process.env.DATABASE_URL = url.toString();
const { pool, transaction } = await import("../../server/db.js");
const { insert } = await import("../../server/business.js");
const { hashPassword, verifyPassword } = await import("../../server/auth.js");
const { provisionOfficers } =
  await import("../../server/provision-officers.js");
const { provisionProfileAccounts, ensureProfileAccount } =
  await import("../../server/auto-accounts.js");
let actor: Actor;
let originalHash: string;
let bankId: string;
before(async () => {
  await control.query(`CREATE DATABASE ${name}`);
  await pool.query(
    await readFile(new URL("../../server/schema.sql", import.meta.url), "utf8"),
  );
  await transaction(async (client) => {
    const district = await insert(client, "districts", {
      district_name: randomUUID(),
      state_name: "Test",
    });
    const office = await insert(client, "offices", {
      office_name: "Provision test office",
      office_code: randomUUID(),
      district_id: district.id,
      address: "Test",
    });
    actor = (await insert(client, "users", {
      username: "test-admin",
      role: "administrator",
      password_hash: hashPassword("OriginalAdminPassword"),
    })) as Actor;
    for (const [officer_name, designation] of [
      ["Existing surveyor", "survey_officer"],
      ["New surveyor", "survey_officer"],
      ["New valuer", "valuation_officer"],
      ["Bank verifier", "bank_verifier"],
      ["New auditor", "auditor"],
      ["New registrar", "sub_registrar"],
    ]) {
      const profile = await insert(client, "officers", {
        officer_name,
        designation,
        office_id: office.id,
        email: "preserve@example.test",
        phone: "0000000000",
      });
      if (officer_name === "Existing surveyor") {
        originalHash = hashPassword("ExistingPassword@2026");
        await insert(client, "users", {
          username: "survey1",
          role: designation,
          officer_id: profile.id,
          password_hash: originalHash,
        });
      }
    }
    const bank = await insert(client, "users", {
      username: "bank1",
      role: "bank_verifier",
      password_hash: hashPassword("ExistingBankPassword"),
    });
    bankId = bank.id;
  });
});

after(async () => {
  await pool.end();
  await control.query(`DROP DATABASE IF EXISTS ${name} CASCADE`);
  await control.end();
});
test("provisioning previews without mutations, preserves credentials and contacts, links legacy bank and is idempotent", async () => {
  const before = (await pool.query("SELECT * FROM users ORDER BY id")).rows;
  const preview = await transaction((client) =>
    provisionOfficers(client, actor, false, ""),
  );
  assert(
    preview.accounts.some(
      (r) => r.username === "survey2" && r.status === "would_create",
    ),
  );
  assert(
    preview.accounts.some(
      (r) => r.username === "bank1" && r.status === "would_link",
    ),
  );
  assert.deepEqual(
    (await pool.query("SELECT * FROM users ORDER BY id")).rows,
    before,
  );
  await assert.rejects(
    transaction((client) => provisionOfficers(client, actor, true, "")),
    /OFFICER_PASSWORD_SUFFIX/,
  );
  assert.deepEqual(
    (await pool.query("SELECT * FROM users ORDER BY id")).rows,
    before,
  );
  const applied = await transaction((client) =>
    provisionOfficers(client, actor, true, "@landledger"),
  );
  assert.equal(
    applied.accounts.filter((r) => r.status === "created").length,
    4,
  );
  assert.equal(applied.accounts.filter((r) => r.status === "linked").length, 1);
  assert.deepEqual(applied.accounts_needing_officer_profiles, []);
  assert.equal(
    (
      await pool.query(
        "SELECT password_hash FROM users WHERE username='survey1'",
      )
    ).rows[0].password_hash,
    originalHash,
  );
  assert(
    verifyPassword(
      "Survey2@landledger",
      (
        await pool.query(
          "SELECT password_hash FROM users WHERE username='survey2'",
        )
      ).rows[0].password_hash,
    ),
  );
  assert(
    (await pool.query("SELECT officer_id FROM users WHERE id=$1", [bankId]))
      .rows[0].officer_id,
  );
  assert(
    (await pool.query("SELECT email,phone FROM officers")).rows.every(
      (r) => r.email === "preserve@example.test" && r.phone === "0000000000",
    ),
  );
  const snapshot = (await pool.query("SELECT * FROM users ORDER BY id")).rows;
  const repeated = await transaction((client) =>
    provisionOfficers(client, actor, true, "@landledger"),
  );
  assert(repeated.accounts.every((r) => r.status === "preserved"));
  assert.deepEqual(
    (await pool.query("SELECT * FROM users ORDER BY id")).rows,
    snapshot,
  );
});

test("automatic backfill creates missing owner and officer logins without replacing existing credentials", async () => {
  const existing = (
    await pool.query("SELECT id,password_hash FROM users ORDER BY id")
  ).rows;
  const office = (await pool.query("SELECT id FROM offices LIMIT 1")).rows[0];
  await transaction(async (client) => {
    for (const name of ["New owner A", "New owner B"])
      await insert(client, "owners", {
        owner_name: name,
        identification_no: randomUUID(),
        address: "Test",
      });
    await insert(client, "officers", {
      officer_name: "Another auditor",
      designation: "auditor",
      office_id: office.id,
      active: true,
    });
  });
  const logins = await transaction((client) =>
    provisionProfileAccounts(client, actor),
  );
  assert.equal(logins.length, 3);
  for (const login of logins) {
    const account = (
      await pool.query("SELECT * FROM users WHERE username=$1", [
        login.username,
      ])
    ).rows[0];
    assert(verifyPassword(login.password, account.password_hash));
    assert(account.owner_id || account.officer_id);
  }
  for (const account of existing)
    assert.equal(
      (
        await pool.query("SELECT password_hash FROM users WHERE id=$1", [
          account.id,
        ])
      ).rows[0].password_hash,
      account.password_hash,
    );
  const retired = logins.find((login) => login.role === "owner")!;
  await pool.query("UPDATE users SET active=false WHERE username=$1", [
    retired.username,
  ]);
  assert.deepEqual(
    await transaction((client) => provisionProfileAccounts(client, actor)),
    [],
  );
  assert.equal(
    (
      await pool.query("SELECT active FROM users WHERE username=$1", [
        retired.username,
      ])
    ).rows[0].active,
    false,
  );
  const audit = JSON.stringify(
    (await pool.query("SELECT summary FROM audit_events")).rows,
  );
  assert(logins.every((login) => !audit.includes(login.password)));
});

test("concurrent profile creations allocate different numbered accounts and failures roll back both records", async () => {
  const results = await Promise.all(
    ["Concurrent A", "Concurrent B"].map((owner_name) =>
      transaction(async (client) => {
        const owner = await insert(client, "owners", {
          owner_name,
          identification_no: randomUUID(),
          address: "Test",
        });
        return ensureProfileAccount(client, actor, "owners", owner);
      }),
    ),
  );
  assert.notEqual(results[0]!.username, results[1]!.username);
  const before = (
    await pool.query(
      "SELECT (SELECT count(*) FROM owners) AS owners,(SELECT count(*) FROM users) AS users",
    )
  ).rows[0];
  await assert.rejects(
    transaction(async (client) => {
      const owner = await insert(client, "owners", {
        owner_name: "Rollback",
        identification_no: randomUUID(),
        address: "Test",
      });
      await ensureProfileAccount(client, actor, "owners", owner);
      throw new Error("intentional rollback");
    }),
    /intentional rollback/,
  );
  assert.deepEqual(
    (
      await pool.query(
        "SELECT (SELECT count(*) FROM owners) AS owners,(SELECT count(*) FROM users) AS users",
      )
    ).rows[0],
    before,
  );
});
