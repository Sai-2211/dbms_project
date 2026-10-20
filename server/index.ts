import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import path from "node:path";
import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import pg from "pg";
import { config, checkConfig } from "./config.js";
import { readSchema } from "./catalog.js";
import { pool, transaction, assertCockroach } from "./db.js";
import {
  authenticate,
  createSession,
  hashPassword,
  setSession,
  sessionCookieName,
  requestTab,
  verifyPassword,
} from "./auth.js";
import {
  resourceMap,
  resources,
  canRead,
  canWrite,
  canReview,
} from "./resources.js";
import { accessible, propertyAccess, redact, scope } from "./access.js";
import { demand, HttpError } from "./errors.js";
import { uuidPattern, validateRecord } from "./validation.js";
import { accountLinks } from "./accounts.js";
import { liveUpdates, closeLiveUpdates } from "./live.js";
import { dashboard } from "./dashboard.js";
import { publicPortal } from "./public-portal.js";
import { validatePublicSignup } from "./signup.js";
import { createAccount, officerAccountDetails } from "./accounts.js";
import {
  importTrainingDataset,
  trainingDatasetId,
  recoverTrainingAttachment,
} from "./training-import.js";
import {
  approveTransfer,
  audit,
  certificateSnapshot,
  immutable,
  insert,
  registrar,
  today,
  validateRelations,
  updateSurveyBoundary,
} from "./business.js";

pg.types.setTypeParser(1082, (value) => value);
checkConfig();
const app = express();
app.set("trust proxy", config.trustProxy);
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  }),
);
app.use(express.json({ limit: "100kb" }));
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use("/api", (req, _res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    demand(
      req.headers["x-landledger-request"] === "1",
      "Missing application request header.",
      403,
    );
    const origin = req.headers.origin;
    const localOrigin = `http://127.0.0.1:${config.port}`;
    demand(
      !origin ||
        origin === config.origin ||
        (!config.production && origin === localOrigin),
      "Request origin is not allowed.",
      403,
    );
  }
  next();
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Try again later." },
});
const dummyHash = hashPassword(randomUUID());
const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Too many account creation attempts. Please try again later.",
  },
});
app.get("/api/health", async (_req, res) => {
  try {
    await assertCockroach();
    res.json({ status: "connected", database: "CockroachDB" });
  } catch {
    res.status(503).json({
      status: "disconnected",
      database: "CockroachDB",
      error: "CockroachDB is unavailable. Check the database connection.",
    });
  }
});
app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const { username, password, portal } = req.body ?? {};
  demand(
    portal === undefined || portal === "department" || portal === "public",
    "Select a valid sign-in area.",
  );
  demand(
    typeof username === "string" &&
      username.length <= 200 &&
      typeof password === "string" &&
      password.length <= 200,
    "Enter a username and password.",
  );
  const { rows } = await pool.query(
    "SELECT u.* FROM users u LEFT JOIN officers o ON o.id=u.officer_id WHERE u.username=$1 AND u.active=true AND (u.officer_id IS NULL OR o.active=true)",
    [username.trim().toLowerCase()],
  );
  const correct = verifyPassword(password, rows[0]?.password_hash ?? dummyHash);
  demand(rows[0] && correct, "The username or password is incorrect.", 401);
  demand(
    portal === undefined ||
      (portal === "public") === (rows[0].role === "public_viewer"),
    "This account belongs to the other sign-in area. Choose Public user or Department / administrator.",
    403,
  );
  if (rows[0].officer_id)
    demand(
      (
        await pool.query(
          "SELECT id FROM officers WHERE id=$1 AND active=true AND designation=$2",
          [rows[0].officer_id, rows[0].role],
        )
      ).rows.length,
      "Your linked officer profile is inactive or has a different designation. Contact the administrator.",
      403,
    );
  setSession(res, createSession(rows[0].id, requestTab(req)), req);
  const { id, role, owner_id, officer_id } = rows[0];
  res.json({ id, username: rows[0].username, role, owner_id, officer_id });
});
app.post("/api/auth/signup", signupLimiter, async (req, res) => {
  const { username, password } = validatePublicSignup(req.body);
  const actor = await transaction(async (client) => {
    const row = await insert(client, "users", {
      username,
      password_hash: hashPassword(password),
      role: "public_viewer",
      owner_id: null,
      officer_id: null,
    });
    const actor = {
      id: row.id as string,
      username,
      role: "public_viewer" as const,
      owner_id: null,
      officer_id: null,
    };
    await audit(client, actor, "self_register", "users", actor.id, {
      role: "public_viewer",
    });
    return actor;
  });
  setSession(res, createSession(actor.id, requestTab(req)), req);
  res.status(201).json(actor);
});
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(sessionCookieName(req), {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: config.production,
  });
  res.json({ ok: true });
});
app.use("/api", authenticate);
app.use(
  "/api",
  rateLimit({
    windowMs: 60_000,
    limit: 240,
    keyGenerator: (req) => req.actor.id,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many requests. Please wait a minute." },
  }),
);
app.get("/api/auth/me", (req, res) => res.json(req.actor));
app.get("/api/events", liveUpdates);
// Deny department endpoints by default, including new endpoints added in future.
app.use("/api", (req, _res, next) => {
  demand(
    req.actor.role !== "public_viewer" || req.path.startsWith("/public/"),
    "Public accounts can only view the public property portal.",
    403,
  );
  next();
});
app.use("/api/public", publicPortal);
app.get("/api/schema", async (req, res) => {
  demand(
    req.actor.role === "administrator",
    "Administrator access is required.",
    403,
  );
  res.json(await readSchema());
});
app.get("/api/metadata", (req, res) =>
  res.json(
    resources
      .filter((r) => canRead(req.actor, r))
      .map((r) => ({
        ...r,
        ...(r.key === "officers" && req.actor.role === "administrator"
          ? {
              fields: [
                ...r.fields,
                {
                  key: "account_username",
                  label: "Login account",
                  type: "text",
                  readOnly: true,
                },
                {
                  key: "account_active",
                  label: "Login active",
                  type: "boolean",
                  readOnly: true,
                },
              ],
              columns: [...r.columns, "account_username"],
            }
          : {}),
        canWrite: canWrite(req.actor, r),
        canReview: canReview(req.actor, r),
        writes: undefined,
        reads: undefined,
      })),
  ),
);
app.get("/api/lookups/:key", async (req, res) => {
  const r = resourceMap.get(String(req.params.key));
  demand(r, "Unknown record type.", 404);
  const values: unknown[] = [];
  const predicate = scope(req.actor, r, values);
  const { rows } = await pool.query(
    `SELECT r.* FROM ${r.key} r WHERE ${predicate} ORDER BY r.created_at DESC LIMIT 1000`,
    values,
  );
  const visibleRows =
    r.key === "officers" && req.actor.role === "administrator"
      ? await officerAccountDetails(pool, rows)
      : rows;
  res.json(
    visibleRows.map((row) => ({
      id: row.id,
      label:
        r.key === "transactions"
          ? `${row.transaction_type} · ${String(row.id).slice(0, 8)}`
          : r.key === "properties"
            ? `${row.survey_no} · ${row.location}`
            : String(row[r.label]),
      designation: row.designation,
      active: row.active,
      has_account: row.has_account,
      district_id: row.district_id,
      office_id: row.office_id,
      property_id: row.property_id,
      transaction_type: row.transaction_type,
      service_type: row.service_type,
      status: row.status,
    })),
  );
});
app.get("/api/dashboard", async (req, res) =>
  res.json(await dashboard(req.actor)),
);

app.get("/api/records/:key", async (req, res) => {
  const r = getResource(req.params.key);
  const values: unknown[] = [];
  const conditions = [scope(req.actor, r, values)];
  const q =
    typeof req.query.q === "string" ? req.query.q.trim().slice(0, 200) : "";
  if (q) {
    values.push(`%${q}%`);
    const searchParameter = values.length;
    const searchable =
      r.key === "owners" &&
      ["bank_verifier", "auditor", "owner"].includes(req.actor.role)
        ? [r.label]
        : r.columns;
    const searchParts = searchable.map(
      (k) => `CAST(r.${k} AS STRING) ILIKE $${values.length}`,
    );
    for (const field of r.fields.filter((f) => f.reference)) {
      const related = resourceMap.get(field.reference!);
      if (!related || !canRead(req.actor, related)) continue;
      const relatedScope = scope(req.actor, related, values, "lookup");
      searchParts.push(
        `EXISTS(SELECT 1 FROM ${related.key} lookup WHERE lookup.id=r.${field.key} AND ${relatedScope} AND CAST(lookup.${related.label} AS STRING) ILIKE $${searchParameter})`,
      );
    }
    conditions.push(`(${searchParts.join(" OR ")})`);
  }
  for (const key of [
    "property_id",
    "transaction_id",
    "owner_id",
    "office_id",
    "district_id",
    "officer_id",
    "verifying_officer_id",
    "approving_officer_id",
    "reviewing_officer_id",
    "issuing_officer_id",
    "payer_owner_id",
    "applicant_owner_id",
  ]) {
    if (req.query[key] && r.fields.some((f) => f.key === key)) {
      demand(uuidPattern.test(String(req.query[key])), "Invalid filter ID.");
      values.push(req.query[key]);
      conditions.push(`r.${key}=$${values.length}`);
    }
  }
  const statusField = r.fields.find((f) =>
    [
      "status",
      "registration_status",
      "verification_status",
      "survey_status",
      "payment_status",
    ].includes(f.key),
  );
  if (req.query.status && statusField?.options) {
    demand(
      statusField.options.includes(String(req.query.status)),
      "Invalid status filter.",
    );
    values.push(req.query.status);
    conditions.push(`r.${statusField.key}=$${values.length}`);
  }
  const filter = conditions.join(" AND ");
  const count = (
    await pool.query(
      `SELECT count(*) AS count FROM ${r.key} r WHERE ${filter}`,
      values,
    )
  ).rows[0].count;
  const page = Math.max(
    1,
    Math.min(100000, Math.trunc(Number(req.query.page) || 1)),
  );
  const limit = Math.max(
    1,
    Math.min(100, Math.trunc(Number(req.query.limit) || 10)),
  );
  values.push(limit, (page - 1) * limit);
  const sort = r.key === "audit_events" ? "occurred_at" : "created_at";
  const { rows } = await pool.query(
    `SELECT r.* FROM ${r.key} r WHERE ${filter} ORDER BY r.${sort} DESC,r.id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  res.json({
    rows: (r.key === "officers" && req.actor.role === "administrator"
      ? await officerAccountDetails(pool, rows)
      : rows
    ).map((row) => redact(req.actor, r, row)),
    total: Number(count),
    page,
    limit,
  });
});
app.get("/api/records/:key/:id", async (req, res) => {
  const r = getResource(req.params.key);
  validateId(req.params.id);
  const result = await transaction(async (client) => {
    const row = await accessible(client, req.actor, r, String(req.params.id));
    return redact(
      req.actor,
      r,
      r.key === "officers" && req.actor.role === "administrator"
        ? (await officerAccountDetails(client, [row]))[0]
        : row,
    );
  });
  res.json(result);
});
app.post("/api/records/:key", async (req, res) => {
  const r = getResource(req.params.key);
  demand(canWrite(req.actor, r), "You cannot create this record.", 403);
  const data = validateRecord(r, req.body?.data);
  demand(
    r.key !== "officers",
    "Create an officer through User accounts so the profile and login stay linked.",
    409,
  );

  const result = await transaction(async (client) => {
    await validateRelations(client, req.actor, r, data);
    if (r.key === "certificates") {
      const officer = await registrar(client, req.actor, req.body.officer_id);
      const prop = await propertyAccess(
        client,
        req.actor,
        String(data.property_id),
      );
      demand(
        prop.office_id === officer.office_id,
        "The issuer must belong to the property registration office.",
      );
      data.issue_date = today();
      data.issuing_officer_id = officer.id;
      data.snapshot_summary = JSON.stringify(
        await certificateSnapshot(client, data),
      );
    }
    const row = await insert(client, r.key, data);
    if (req.actor.role === "owner" && r.key === "properties")
      await insert(client, "applications", {
        property_id: row.id,
        applicant_owner_id: req.actor.owner_id,
        service_type: "registration",
        submitted_date: today(),
        notes: "Property registration submitted through the owner portal.",
      });
    if (req.actor.role === "owner" && r.key === "transactions") {
      const service =
        row.transaction_type === "registration" ? "registration" : "transfer";
      const linked = await client.query(
        "UPDATE applications SET transaction_id=$1,updated_at=now() WHERE property_id=$2 AND applicant_owner_id=$3 AND service_type=$4 AND transaction_id IS NULL AND status IN ('submitted','under_review') RETURNING id",
        [row.id, row.property_id, req.actor.owner_id, service],
      );
      if (!linked.rows.length)
        await insert(client, "applications", {
          property_id: row.property_id,
          applicant_owner_id: req.actor.owner_id,
          service_type:
            row.transaction_type === "registration"
              ? "registration"
              : "transfer",
          submitted_date: today(),
          transaction_id: row.id,
        });
    }
    if (r.key === "surveys" && row.survey_status === "completed")
      await updateSurveyBoundary(client, row);
    if (r.key === "certificates" && row.application_id)
      await client.query(
        "UPDATE applications SET status='approved',reviewing_officer_id=$1,updated_at=now() WHERE id=$2",
        [row.issuing_officer_id, row.application_id],
      );
    await audit(client, req.actor, "create", r.key, row.id, {
      fields: Object.keys(data).filter(
        (k) => !["snapshot_summary"].includes(k),
      ),
    });
    return redact(req.actor, r, row);
  });
  res.status(201).json(result);
});
app.patch("/api/records/:key/:id", async (req, res) => {
  const r = getResource(req.params.key);
  validateId(req.params.id);
  demand(canWrite(req.actor, r), "You cannot update this record.", 403);
  const data = validateRecord(r, req.body?.data, true);
  demand(Object.keys(data).length, "No changes provided.");
  const result = await transaction(async (client) => {
    const old = await accessible(
      client,
      req.actor,
      r,
      String(req.params.id),
      true,
    );
    if (req.body?.expected_version !== undefined)
      demand(
        typeof req.body.expected_version === "string" &&
          req.body.expected_version === old._version,
        "This record changed in another session. Cancel editing to load the latest record before saving again.",
        409,
      );
    demand(
      !immutable(r, old),
      "This finalized record is preserved. Create a new record instead.",
      409,
    );
    if (req.actor.role === "owner" && r.key === "owners")
      demand(
        old.id === req.actor.owner_id,
        "Only your own profile can be changed.",
        403,
      );
    await validateRelations(client, req.actor, r, data, old);
    const keys = Object.keys(data);
    const values = [...Object.values(data), old.id];
    const { rows } = await client.query(
      `UPDATE ${r.key} SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(",")},updated_at=now() WHERE id=$${values.length} RETURNING *,updated_at::STRING AS _version`,
      values,
    );
    if (r.key === "officers" && "active" in data) {
      const linked = (
        await client.query(
          `UPDATE users SET active=$1,updated_at=now() WHERE officer_id=$2
            AND ($1=false OR NOT EXISTS(SELECT 1 FROM audit_events a WHERE a.entity_type='users' AND a.entity_id=users.id AND a.action='delete_account')) RETURNING id`,
          [rows[0].active, old.id],
        )
      ).rows;
      for (const account of linked)
        await audit(client, req.actor, "update", "users", account.id, {
          fields: ["active"],
          source: "officer_status",
        });
    }
    if (r.key === "surveys" && rows[0].survey_status === "completed")
      await updateSurveyBoundary(client, rows[0]);
    await audit(client, req.actor, "update", r.key, old.id, { fields: keys });
    return redact(req.actor, r, rows[0]);
  });
  res.json(result);
});
app.delete("/api/records/:key/:id", async (req, res) => {
  const r = getResource(req.params.key);
  validateId(req.params.id);
  demand(
    req.actor.role === "administrator" && canWrite(req.actor, r),
    "Only an administrator can remove unfinalized records.",
    403,
  );
  await transaction(async (client) => {
    const old = await accessible(
      client,
      req.actor,
      r,
      String(req.params.id),
      true,
    );
    demand(!immutable(r, old), "Finalized records cannot be deleted.", 409);
    if (r.key === "transaction_parties")
      await validateRelations(client, req.actor, r, {}, old);
    if (r.key === "properties")
      demand(
        old.registration_status !== "registered",
        "Registered properties cannot be deleted.",
        409,
      );
    await client.query(`DELETE FROM ${r.key} WHERE id=$1`, [old.id]);
    const officeId =
      old.office_id ||
      (r.key === "offices"
        ? old.id
        : old.property_id
          ? (
              await client.query(
                "SELECT office_id FROM properties WHERE id=$1",
                [old.property_id],
              )
            ).rows[0]?.office_id
          : null);
    await audit(
      client,
      req.actor,
      "delete",
      r.key,
      old.id,
      officeId ? { office_id: officeId } : {},
    );
  });
  res.json({ ok: true });
});

app.post("/api/records/:key/:id/review", async (req, res) => {
  const r = getResource(req.params.key);
  validateId(req.params.id);
  demand(
    ["transactions", "documents", "mutations", "applications"].includes(r.key),
    "This record does not have a review workflow.",
  );
  demand(canReview(req.actor, r), "You cannot review this record.", 403);
  const action = req.body?.action;
  demand(
    ["approve", "reject", "under_review"].includes(action),
    "Select a valid review action.",
  );
  const result = await transaction(async (client) => {
    if (r.key === "transactions" && action === "approve")
      return approveTransfer(
        client,
        req.actor,
        String(req.params.id),
        req.body.officer_id,
      );
    const officer = await registrar(client, req.actor, req.body.officer_id);
    const row = await accessible(
      client,
      req.actor,
      r,
      String(req.params.id),
      true,
    );
    demand(!immutable(r, row), "This record has already been finalized.", 409);
    const property = await propertyAccess(client, req.actor, row.property_id);
    demand(
      property.office_id === officer.office_id,
      "The reviewing officer must belong to the property registration office.",
    );
    let sql: string;
    let values: unknown[];
    if (r.key === "documents") {
      demand(action !== "under_review", "Choose verify or reject.");
      if (action === "approve")
        demand(row.file_key, "Upload a digital copy before verification.");
      sql =
        "UPDATE documents SET verification_status=$1,verifying_officer_id=$2,verified_date=$3,updated_at=now() WHERE id=$4 RETURNING *";
      values = [
        action === "approve" ? "verified" : "rejected",
        action === "approve" ? officer.id : null,
        action === "approve" ? today() : null,
        row.id,
      ];
    } else if (r.key === "applications") {
      if (action === "approve") {
        if (["registration", "transfer"].includes(row.service_type)) {
          const linked =
            row.transaction_id &&
            (
              await client.query(
                "SELECT id FROM transactions WHERE id=$1 AND status='approved'",
                [row.transaction_id],
              )
            ).rows[0];
          demand(
            linked,
            "Approve the linked transaction to complete this application.",
          );
        }
        if (row.service_type === "encumbrance_certificate")
          demand(
            (
              await client.query(
                "SELECT id FROM certificates WHERE application_id=$1",
                [row.id],
              )
            ).rows.length,
            "Issue the certificate to complete this application.",
          );
        if (row.service_type === "mutation")
          demand(
            (
              await client.query(
                "SELECT id FROM mutations WHERE property_id=$1 AND status='approved'",
                [row.property_id],
              )
            ).rows.length,
            "Approve a related mutation before completing this application.",
          );
      }
      sql =
        "UPDATE applications SET status=$1,reviewing_officer_id=$2,updated_at=now() WHERE id=$3 RETURNING *";
      values = [
        action === "under_review"
          ? "under_review"
          : action === "approve"
            ? "approved"
            : "rejected",
        officer.id,
        row.id,
      ];
    } else {
      demand(action !== "under_review", "Choose approve or reject.");
      if (
        r.key === "mutations" &&
        row.mutation_type === "ownership_change" &&
        action === "approve"
      )
        demand(
          (
            await client.query(
              "SELECT id FROM transactions WHERE id=$1 AND status='approved'",
              [row.transaction_id],
            )
          ).rows.length,
          "Approve the related ownership transaction first.",
        );
      sql = `UPDATE ${r.key} SET status=$1,approving_officer_id=$2,${r.key === "transactions" ? "approval_date=$3," : ""}updated_at=now() WHERE id=$${r.key === "transactions" ? 4 : 3} RETURNING *`;
      values =
        r.key === "transactions"
          ? ["rejected", null, null, row.id]
          : [
              action === "approve" ? "approved" : "rejected",
              action === "approve" ? officer.id : null,
              row.id,
            ];
    }
    const result = (await client.query(sql, values)).rows[0];
    if (r.key === "transactions" && action === "reject")
      await client.query(
        "UPDATE applications SET status='rejected',reviewing_officer_id=$1,updated_at=now() WHERE transaction_id=$2 AND status IN ('submitted','under_review')",
        [officer.id, row.id],
      );
    await audit(client, req.actor, action, r.key, row.id);
    return result;
  });
  res.json(result);
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});
const uploadLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  keyGenerator: (req) => req.actor.id,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many uploads. Please wait a minute." },
});
app.post(
  "/api/documents/:id/file",
  uploadLimiter,
  (req, _res, next) => {
    validateId(req.params.id);
    demand(
      canWrite(req.actor, resourceMap.get("documents")!),
      "You cannot upload documents.",
      403,
    );
    next();
  },
  upload.single("file"),
  async (req, res) => {
    validateId(req.params.id);
    demand(
      canWrite(req.actor, resourceMap.get("documents")!),
      "You cannot upload documents.",
      403,
    );
    demand(req.file, "Select a PDF, PNG or JPEG (up to 10 MB).");
    const bytes = req.file.buffer;
    const format =
      bytes.subarray(0, 5).toString() === "%PDF-"
        ? "pdf"
        : bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? "png"
          : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            ? "jpg"
            : null;
    demand(format, "Only PDF, PNG and JPEG file contents are accepted.");
    const fileKey = `${randomUUID()}.${format}`;
    await mkdir(config.uploads, { recursive: true });
    await writeFile(path.join(config.uploads, fileKey), bytes, {
      flag: "wx",
      mode: 0o600,
    });
    let oldKey: string | undefined;
    try {
      await transaction(async (client) => {
        const document = await accessible(
          client,
          req.actor,
          resourceMap.get("documents")!,
          String(req.params.id),
          true,
        );
        demand(
          document.verification_status === "pending",
          "A verified or rejected document cannot be replaced.",
          409,
        );
        if (document.transaction_id)
          demand(
            (
              await client.query(
                "SELECT status FROM transactions WHERE id=$1",
                [document.transaction_id],
              )
            ).rows[0]?.status === "pending",
            "The transaction is finalized.",
            409,
          );
        oldKey = document.file_key;
        await client.query(
          "UPDATE documents SET file_key=$1,original_filename=$2,media_type=$3,file_size=$4,sha256=$5,updated_at=now() WHERE id=$6",
          [
            fileKey,
            path.basename(req.file!.originalname).slice(0, 200),
            format === "pdf"
              ? "application/pdf"
              : format === "png"
                ? "image/png"
                : "image/jpeg",
            bytes.length,
            createHash("sha256").update(bytes).digest("hex"),
            document.id,
          ],
        );
        await audit(client, req.actor, "upload", "documents", document.id, {
          format,
          bytes: bytes.length,
        });
      });
    } catch (error) {
      await unlink(path.join(config.uploads, fileKey)).catch(() => {});
      throw error;
    }
    if (
      oldKey &&
      !(
        await pool.query("SELECT id FROM documents WHERE file_key=$1 LIMIT 1", [
          oldKey,
        ])
      ).rows.length
    )
      await unlink(path.join(config.uploads, path.basename(oldKey))).catch(
        () => {},
      );
    res.json({ ok: true });
  },
);
app.get("/api/documents/:id/file", async (req, res) => {
  validateId(req.params.id);
  const document = await transaction((client) =>
    accessible(
      client,
      req.actor,
      resourceMap.get("documents")!,
      String(req.params.id),
    ),
  );
  demand(document.file_key, "No digital copy has been uploaded.", 404);
  demand(
    path.basename(document.file_key) === document.file_key,
    "Invalid stored document.",
    500,
  );
  res.setHeader("Content-Type", document.media_type);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.attachment(document.original_filename || "document");
  let bytes: Buffer;
  try {
    bytes = await readFile(path.join(config.uploads, document.file_key));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const sample = await recoverTrainingAttachment(document);
    if (!sample) throw error;
    bytes = sample;
  }
  res.send(bytes);
});

app.post("/api/training-import", async (req, res) => {
  demand(
    req.actor.role === "administrator",
    "Administrator access is required.",
    403,
  );
  demand(
    req.body?.dataset === trainingDatasetId &&
      Object.keys(req.body).length === 1,
    "Select the supplied training dataset. Custom records are not accepted.",
  );
  const report = await importTrainingDataset(req.actor, config.uploads);
  res.status(report.status === "imported" ? 201 : 200).json(report);
});

app.get("/api/accounts", async (req, res) => {
  demand(
    req.actor.role === "administrator",
    "Administrator access is required.",
    403,
  );
  res.json(
    (
      await pool.query(`SELECT u.id,u.username,u.role,u.owner_id,u.officer_id,u.active,
    o.officer_name,o.office_id,o.email,o.phone,f.office_name,n.owner_name
    FROM users u LEFT JOIN officers o ON o.id=u.officer_id LEFT JOIN offices f ON f.id=o.office_id
    LEFT JOIN owners n ON n.id=u.owner_id ORDER BY u.created_at DESC`)
    ).rows,
  );
});
app.post("/api/accounts", async (req, res) => {
  res.status(201).json(await createAccount(req.actor, req.body));
});
// Repair existing profile links without silently changing credentials or roles.
app.patch("/api/accounts/:id", async (req, res) => {
  demand(
    req.actor.role === "administrator",
    "Administrator access is required.",
    403,
  );
  validateId(req.params.id);
  demand(
    req.body &&
      Object.keys(req.body).every((k) =>
        ["owner_id", "officer_id"].includes(k),
      ),
    "Only linked profiles can be changed here.",
  );
  const result = await transaction(async (client) => {
    const old = (
      await client.query(
        "SELECT * FROM users WHERE id=$1 AND active=true FOR UPDATE",
        [req.params.id],
      )
    ).rows[0];
    demand(old, "Active account not found.", 404);
    demand(
      !["administrator", "public_viewer"].includes(old.role),
      "This role does not use a linked profile.",
    );
    const links = await accountLinks(
      client,
      old.role,
      req.body.owner_id ?? old.owner_id,
      req.body.officer_id ?? old.officer_id,
      old.id,
    );
    const row = (
      await client.query(
        "UPDATE users SET owner_id=$1,officer_id=$2,updated_at=now() WHERE id=$3 RETURNING id,username,role,owner_id,officer_id,active",
        [links.owner_id, links.officer_id, old.id],
      )
    ).rows[0];
    await audit(client, req.actor, "link_profile", "users", old.id, links);
    return row;
  });
  res.json(result);
});
app.delete("/api/accounts/:id", async (req, res) => {
  demand(
    req.actor.role === "administrator",
    "Administrator access is required.",
    403,
  );
  validateId(req.params.id);
  demand(
    req.params.id !== req.actor.id,
    "You cannot delete your own signed-in account.",
    409,
  );
  const result = await transaction(async (client) => {
    const account = (
      await client.query(
        "SELECT id,role,active FROM users WHERE id=$1 FOR UPDATE",
        [req.params.id],
      )
    ).rows[0];
    demand(account, "Account not found.", 404);
    const retained = !!(
      await client.query(
        "SELECT id FROM audit_events WHERE actor_id=$1 LIMIT 1",
        [account.id],
      )
    ).rows.length;
    if (retained)
      await client.query(
        "UPDATE users SET active=false,password_hash=$1,updated_at=now() WHERE id=$2",
        [hashPassword(randomUUID()), account.id],
      );
    else await client.query("DELETE FROM users WHERE id=$1", [account.id]);
    await audit(client, req.actor, "delete_account", "users", account.id, {
      role: account.role,
      history_retained: retained,
    });
    return { ok: true, history_retained: retained };
  });
  res.json(result);
});

app.use("/api", (_req, res) =>
  res.status(404).json({ error: "API endpoint not found." }),
);
if (existsSync(path.resolve("dist/index.html"))) {
  app.use(express.static(path.resolve("dist")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
}
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    const e = error as { code?: string; name?: string; status?: number };
    const messages: Record<string, string> = {
      "23505": "A record with this unique value already exists.",
      "23503":
        "A referenced record is missing, or this record is still in use.",
      "23514": "A database validation rule was not satisfied.",
      "40001": "The record changed during processing. Please try again.",
      "22P02": "A value has an invalid format.",
      LIMIT_FILE_SIZE: "The file exceeds the 10 MB limit.",
      LIMIT_FILE_COUNT: "Upload one file at a time.",
      LIMIT_UNEXPECTED_FILE: "Use the file upload field for one document.",
      LIMIT_FIELD_VALUE: "An upload field is too large.",
    };
    if (e.code && messages[e.code]) {
      res
        .status(
          e.code === "LIMIT_FILE_SIZE"
            ? 413
            : e.code.startsWith("LIMIT_")
              ? 400
              : 409,
        )
        .json({ error: messages[e.code] });
      return;
    }
    if (e.status === 400 || e.status === 413) {
      res.status(e.status).json({
        error:
          e.status === 413
            ? "The request exceeds the size limit."
            : "The request could not be read.",
      });
      return;
    }
    if (e.code === "ENOENT") {
      res.status(404).json({ error: "The stored file is unavailable." });
      return;
    }
    if (
      e.code?.startsWith("ECONN") ||
      e.code === "ENOTFOUND" ||
      e.code === "42P01"
    ) {
      res.status(503).json({
        error:
          "The database is unavailable or has not been initialized. Check CockroachDB and run the migration.",
      });
      return;
    }
    console.error("Request failed:", e.code || e.name || "unexpected error");
    res.status(500).json({
      error: "The operation could not be completed. Please try again.",
    });
  },
);
function getResource(key: unknown) {
  const r = resourceMap.get(String(key));
  demand(r, "Unknown record type.", 404);
  return r;
}
function validateId(id: unknown) {
  demand(typeof id === "string" && uuidPattern.test(id), "Invalid record ID.");
}
const server = app.listen(config.port, config.host, () =>
  console.log(
    `LandLedger API listening on http://${config.host}:${config.port}`,
  ),
);
function shutdown() {
  closeLiveUpdates();
  server.close(() => void pool.end());
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
