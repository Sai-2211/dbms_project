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
const name = `landledger_test_live_${Date.now()}_${process.pid}`;
const control = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const url = new URL(process.env.DATABASE_URL!);
url.pathname = `/${name}`;
process.env.DATABASE_URL = url.toString();
process.env.SESSION_SECRET =
  "live-tests-only-session-secret-at-least-32-characters";
const { pool, transaction } = await import("../../server/db.js");
const { insert, audit } = await import("../../server/business.js");
const { hashPassword } = await import("../../server/auth.js");
const { liveRevision } = await import("../../server/live.js");
const base = "http://127.0.0.1:3105",
  password = "LiveIntegration@2026";
let child: ChildProcess | undefined,
  uploads = "";
let admin: Actor, surveyor: Actor, publicActor: Actor;
let property: Record<string, any>,
  foreign: Record<string, any>,
  survey: Record<string, any>;
const adminTab = randomUUID(),
  surveyTab = randomUUID();
let adminCookie = "",
  surveyCookie = "";
const streams = new Set<AbortController>();
async function request(
  route: string,
  cookie = "",
  tab?: string,
  method = "GET",
  body?: unknown,
) {
  const response = await fetch(base + "/api" + route, {
    method,
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-LandLedger-Request": "1",
      Origin: base,
      ...(tab ? { "X-LandLedger-Tab": tab } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
    headers: response.headers,
  };
}
async function login(username: string, tab?: string) {
  const result = await request("/auth/login", "", tab, "POST", {
    username,
    password,
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result;
}
async function openStream(cookie: string, tab?: string) {
  const abort = new AbortController();
  streams.add(abort);
  const response = await fetch(base + "/api/events", {
    headers: { Cookie: cookie, ...(tab ? { "X-LandLedger-Tab": tab } : {}) },
    signal: abort.signal,
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type")!, /text\/event-stream/);
  const reader = response.body!.getReader(),
    decoder = new TextDecoder();
  let buffer = "";
  return {
    close: () => {
      abort.abort();
      streams.delete(abort);
    },
    next: async () => {
      const timeout = setTimeout(() => abort.abort(), 8000);
      try {
        for (;;) {
          const end = buffer.indexOf("\n\n");
          if (end >= 0) {
            const event = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            if (event.startsWith(":")) continue;
            return {
              type: event.match(/^event: (.+)$/m)?.[1],
              id: event.match(/^id: (.+)$/m)?.[1],
              data: event.match(/^data: (.+)$/m)?.[1],
            };
          }
          const { done, value } = await reader.read();
          assert(!done, "Stream ended before the expected event");
          buffer += decoder.decode(value, { stream: true });
        }
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
before(async () => {
  await control.query(`CREATE DATABASE ${name}`);
  await pool.query(
    await readFile(new URL("../../server/schema.sql", import.meta.url), "utf8"),
  );
  await transaction(async (client) => {
    const district = await insert(client, "districts", {
      district_name: "Live test",
      state_name: "Test",
    });
    const office = await insert(client, "offices", {
      office_name: "Live test office",
      office_code: randomUUID(),
      district_id: district.id,
      address: "Test",
    });
    const other = await insert(client, "offices", {
      office_name: "Foreign office",
      office_code: randomUUID(),
      district_id: district.id,
      address: "Test",
    });
    const profile = await insert(client, "officers", {
      officer_name: "Live surveyor",
      designation: "survey_officer",
      office_id: office.id,
    });
    admin = (await insert(client, "users", {
      username: "live-admin",
      role: "administrator",
      password_hash: hashPassword(password),
    })) as Actor;
    surveyor = (await insert(client, "users", {
      username: "live-surveyor",
      role: "survey_officer",
      officer_id: profile.id,
      password_hash: hashPassword(password),
    })) as Actor;
    publicActor = (await insert(client, "users", {
      username: "live-public",
      role: "public_viewer",
      password_hash: hashPassword(password),
    })) as Actor;
    const parcel = {
      survey_no: randomUUID(),
      property_type: "residential",
      area: "100",
      location: "Test address",
      boundary_details: "Boundary",
      district_id: district.id,
      office_id: office.id,
    };
    property = await insert(client, "properties", parcel);
    foreign = await insert(client, "properties", {
      ...parcel,
      survey_no: randomUUID(),
      office_id: other.id,
    });
    survey = await insert(client, "surveys", {
      property_id: property.id,
      officer_id: profile.id,
      survey_no: randomUUID(),
      survey_date: "2025-01-01",
      survey_area: "110",
      boundary_details: "Updated boundary",
      survey_status: "scheduled",
    });
  });
  uploads = await mkdtemp(path.join(tmpdir(), "landledger-live-"));
  child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    env: {
      ...process.env,
      PORT: "3105",
      APP_ORIGIN: base,
      UPLOAD_DIR: uploads,
      NODE_ENV: "development",
    },
    stdio: "ignore",
  });
  let ready = false;
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch(base + "/api/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(ready);
  adminCookie = (await login(admin.username, adminTab)).cookie!;
  surveyCookie = (await login(surveyor.username, surveyTab)).cookie!;
});
after(async () => {
  for (const abort of streams) abort.abort();
  if (child && child.exitCode === null) {
    const exit = new Promise<void>((resolve) =>
      child!.once("exit", () => resolve()),
    );
    child.kill("SIGTERM");
    await exit;
  }
  await pool.end();
  await control.query(`DROP DATABASE IF EXISTS ${name} CASCADE`);
  await control.end();
  if (uploads) await rm(uploads, { recursive: true, force: true });
});
test("two tabs retain independent roles in one cookie jar and logout cannot clear another tab", async () => {
  const legacy = (await login(admin.username)).cookie!;
  const jar = [legacy, adminCookie, surveyCookie].join("; ");
  assert.equal(
    (await request("/auth/me", jar, adminTab)).body.role,
    "administrator",
  );
  assert.equal(
    (await request("/auth/me", jar, surveyTab)).body.role,
    "survey_officer",
  );
  assert.equal((await request("/accounts", jar, surveyTab)).status, 403);
  assert.equal(
    (await request("/auth/me", legacy, surveyTab)).status,
    401,
    "No fallback to a shared privileged legacy cookie",
  );
  assert.equal((await request("/auth/me", jar, randomUUID())).status, 401);
  const token = adminCookie.slice(adminCookie.indexOf("=") + 1);
  assert.equal(
    (
      await request(
        "/auth/me",
        `landledger_session_${surveyTab}=${token}`,
        surveyTab,
      )
    ).status,
    401,
  );
  const logout = await request("/auth/logout", jar, surveyTab, "POST");
  assert.equal(logout.status, 200);
  assert.match(logout.cookie!, new RegExp(`^landledger_session_${surveyTab}=`));
  assert(!logout.cookie!.includes(adminTab));
  assert.equal(
    (await request("/auth/me", [legacy, adminCookie].join("; "), adminTab))
      .status,
    200,
  );
  assert.equal((await request("/auth/me", adminCookie, surveyTab)).status, 401);
  assert.equal((await request("/auth/me", jar, "bad-tab")).status, 400);
  const relogin = await login(surveyor.username, surveyTab);
  surveyCookie = relogin.cookie!;
  assert.match(relogin.headers.get("set-cookie")!, /HttpOnly/);
});
test("downloads authenticate the selected tab even when an administrator cookie is also present", async () => {
  const created = await request(
    "/records/documents",
    adminCookie,
    adminTab,
    "POST",
    {
      data: {
        document_no: randomUUID(),
        property_id: property.id,
        document_type: "survey_report",
        document_date: "2025-01-01",
      },
    },
  );
  assert.equal(created.status, 201);
  const form = new FormData();
  form.append(
    "file",
    new Blob(["%PDF-1.4\nTab-isolated test document"]),
    "tab-test.pdf",
  );
  const uploaded = await fetch(
    base + `/api/documents/${created.body.id}/file`,
    {
      method: "POST",
      headers: {
        Cookie: adminCookie,
        "X-LandLedger-Tab": adminTab,
        "X-LandLedger-Request": "1",
        Origin: base,
      },
      body: form,
    },
  );
  assert.equal(uploaded.status, 200);
  const jar = adminCookie + "; " + surveyCookie;
  const downloaded = await fetch(
    base + `/api/documents/${created.body.id}/file`,
    { headers: { Cookie: jar, "X-LandLedger-Tab": adminTab } },
  );
  assert.equal(downloaded.status, 200);
  assert.match(await downloaded.text(), /Tab-isolated/);
  assert.equal(
    (await request(`/documents/${created.body.id}/file`, jar, surveyTab))
      .status,
    403,
  );
});
test("committed survey changes reach both users through opaque live events and refresh shared property data", async () => {
  const first = await openStream(adminCookie, adminTab),
    second = await openStream(surveyCookie, surveyTab);
  try {
    const a = await first.next(),
      s = await second.next();
    assert.equal(a.type, "refresh");
    assert.equal(s.type, "refresh");
    assert.equal(a.data, "{}");
    assert.match(a.id!, /^[a-f0-9]{64}$/);
    const saved = await request(
      `/records/surveys/${survey.id}`,
      surveyCookie,
      surveyTab,
      "PATCH",
      { data: { survey_status: "completed" } },
    );
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const changes = await Promise.all([first.next(), second.next()]);
    assert.notEqual(changes[0].id, a.id);
    assert.notEqual(changes[1].id, s.id);
    assert(
      changes.every((event) => event.type === "refresh" && event.data === "{}"),
    );
    assert.equal(
      (
        await request(
          `/records/properties/${property.id}`,
          adminCookie,
          adminTab,
        )
      ).body.area,
      "110.0000",
    );
    assert.equal(
      (
        await request(
          `/records/properties/${property.id}`,
          surveyCookie,
          surveyTab,
        )
      ).body.area,
      "110.0000",
    );
  } finally {
    first.close();
    second.close();
  }
});
test("live revisions exclude foreign office changes and rolled-back transactions", async () => {
  const before = await liveRevision(surveyor),
    adminBefore = await liveRevision(admin);
  assert.equal(
    (
      await request(
        `/records/properties/${foreign.id}`,
        adminCookie,
        adminTab,
        "PATCH",
        { data: { location: "Foreign change" } },
      )
    ).status,
    200,
  );
  assert.equal(await liveRevision(surveyor), before);
  assert.notEqual(await liveRevision(admin), adminBefore);
  const stable = await liveRevision(admin);
  await assert.rejects(
    transaction(async (client) => {
      await audit(client, admin, "test_rollback", "properties", property.id);
      throw new Error("Rollback");
    }),
    /Rollback/,
  );
  assert.equal(await liveRevision(admin), stable);
});
test("public live updates reveal no private owner/contact changes but follow registered parcel changes", async () => {
  const cookie = await login(publicActor.username, randomUUID());
  const first = await liveRevision(publicActor);
  await transaction(async (client) => {
    const owner = await insert(client, "owners", {
      owner_name: "Private identity sentinel",
      identification_no: randomUUID(),
      address: "Private",
      email: "private-sentinel@example.test",
    });
    await audit(client, admin, "create", "owners", owner.id);
  });
  assert.equal(await liveRevision(publicActor), first);
  await transaction(async (client) => {
    await client.query(
      "UPDATE properties SET registration_status='registered',registration_date='2025-01-01' WHERE id=$1",
      [property.id],
    );
    await audit(client, admin, "approve", "properties", property.id);
  });
  assert.notEqual(await liveRevision(publicActor), first);
  assert.equal(cookie.status, 200);
});
test("live connections close when an account is deleted and do not affect the other tab", async () => {
  const profile = await transaction((client) =>
    insert(client, "officers", {
      officer_name: "Revocation test",
      designation: "auditor",
      office_id: property.office_id,
    }),
  );
  const account = await request("/accounts", adminCookie, adminTab, "POST", {
    username: "live-temporary",
    password,
    role: "auditor",
    officer_id: profile.id,
  });
  assert.equal(account.status, 201);
  const tab = randomUUID(),
    cookie = (await login("live-temporary", tab)).cookie!,
    stream = await openStream(cookie, tab);
  try {
    await stream.next();
    assert.equal(
      (
        await request(
          `/accounts/${account.body.id}`,
          adminCookie,
          adminTab,
          "DELETE",
        )
      ).status,
      200,
    );
    assert.equal((await stream.next()).type, "signed-out");
    assert.equal((await request("/auth/me", cookie, tab)).status, 401);
    assert.equal(
      (await request("/auth/me", adminCookie, adminTab)).status,
      200,
    );
  } finally {
    stream.close();
  }
});
test("concurrent edits reject a stale version rather than overwrite another user's saved values", async () => {
  const original = await request(
    `/records/properties/${foreign.id}`,
    adminCookie,
    adminTab,
  );
  assert.equal(typeof original.body._version, "string");
  const secondTab = randomUUID(),
    secondCookie = (await login(admin.username, secondTab)).cookie!;
  const first = await request(
    `/records/properties/${foreign.id}`,
    adminCookie,
    adminTab,
    "PATCH",
    {
      data: { location: "First editor saved" },
      expected_version: original.body._version,
    },
  );
  assert.equal(first.status, 200);
  const stale = await request(
    `/records/properties/${foreign.id}`,
    secondCookie,
    secondTab,
    "PATCH",
    {
      data: { location: "Stale overwrite" },
      expected_version: original.body._version,
    },
  );
  assert.equal(stale.status, 409);
  assert.match(stale.body.error, /another session/);
  assert.equal(
    (
      await request(
        `/records/properties/${foreign.id}`,
        secondCookie,
        secondTab,
      )
    ).body.location,
    "First editor saved",
  );
});

test("upstream approval and survey events refresh related property viewers without granting workflow access", async () => {
  const bankProfile = await transaction((client) =>
    insert(client, "officers", {
      officer_name: "Live bank",
      designation: "bank_verifier",
      office_id: property.office_id,
    }),
  );
  const bank = (await transaction((client) =>
    insert(client, "users", {
      username: "live-bank",
      role: "bank_verifier",
      officer_id: bankProfile.id,
      password_hash: hashPassword(password),
    }),
  )) as Actor;
  const bankBefore = await liveRevision(bank),
    surveyBefore = await liveRevision(surveyor);
  await transaction(async (client) => {
    const tx = await insert(client, "transactions", {
      property_id: property.id,
      office_id: property.office_id,
      transaction_type: "registration",
      transaction_date: "2025-01-01",
      consideration: "0",
    });
    await audit(client, admin, "approve", "transactions", tx.id);
  });
  assert.notEqual(
    await liveRevision(bank),
    bankBefore,
    "Approval invalidates the bank's readable property/title view",
  );
  assert.notEqual(
    await liveRevision(surveyor),
    surveyBefore,
    "Approval invalidates a surveyor's assigned parcel view",
  );
  const beforeSurvey = await liveRevision(bank);
  await transaction(async (client) => {
    await audit(client, admin, "update", "surveys", survey.id);
  });
  assert.notEqual(
    await liveRevision(bank),
    beforeSurvey,
    "Survey measurements invalidate the bank's property view",
  );
  const stableBank = await liveRevision(bank),
    stableSurvey = await liveRevision(surveyor);
  await transaction(async (client) => {
    const tx = await insert(client, "transactions", {
      property_id: foreign.id,
      office_id: foreign.office_id,
      transaction_type: "registration",
      transaction_date: "2025-01-01",
      consideration: "0",
    });
    await audit(client, admin, "approve", "transactions", tx.id);
  });
  assert.equal(await liveRevision(bank), stableBank);
  assert.equal(await liveRevision(surveyor), stableSurvey);
  const tab = randomUUID(),
    cookie = (await login(bank.username, tab)).cookie!;
  assert.equal(
    (await request("/records/transactions", cookie, tab)).status,
    403,
  );
  assert.equal((await request("/records/surveys", cookie, tab)).status, 403);
});

test("server shutdown closes active live streams instead of leaving deployment connections hanging", async () => {
  const stream = await openStream(adminCookie, adminTab);
  await stream.next();
  const serverProcess = child!;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const exited = new Promise<void>((resolve, reject) => {
      serverProcess.once("exit", () => resolve());
      timeout = setTimeout(
        () => reject(new Error("Live streams prevented shutdown")),
        8000,
      );
    });
    serverProcess.kill("SIGTERM");
    await exited;
  } finally {
    clearTimeout(timeout);
    stream.close();
  }
});
