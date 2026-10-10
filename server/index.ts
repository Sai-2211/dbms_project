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
  verifyPassword,
} from "./auth.js";
import {
  resourceMap,
  resources,
  canRead,
  canWrite,
  type Resource,
} from "./resources.js";
import { accessible, propertyAccess, redact, scope } from "./access.js";
import { demand, HttpError } from "./errors.js";
import { validDate, uuidPattern, validateRecord } from "./validation.js";
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
  const { username, password } = req.body ?? {};
  demand(
    typeof username === "string" &&
      username.length <= 200 &&
      typeof password === "string" &&
      password.length <= 200,
    "Enter a username and password.",
  );
  const { rows } = await pool.query(
    "SELECT * FROM users WHERE username=$1 AND active=true",
    [username.trim().toLowerCase()],
  );
  const correct = verifyPassword(password, rows[0]?.password_hash ?? dummyHash);
  demand(rows[0] && correct, "The username or password is incorrect.", 401);
  setSession(res, createSession(rows[0].id));
  const { id, role, owner_id, officer_id } = rows[0];
  res.json({ id, username: rows[0].username, role, owner_id, officer_id });
});
app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("landledger_session", {
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
app.get("/api/schema", async (_req, res) => res.json(await readSchema()));
app.get("/api/metadata", (req, res) =>
  res.json(
    resources
      .filter((r) => canRead(req.actor, r))
      .map((r) => ({
        ...r,
        canWrite: canWrite(req.actor, r),
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
  res.json(
    rows.map((row) => ({
      id: row.id,
      label:
        r.key === "transactions"
          ? `${row.transaction_type} · ${String(row.id).slice(0, 8)}`
          : r.key === "properties"
            ? `${row.survey_no} · ${row.location}`
            : String(row[r.label]),
      designation: row.designation,
      active: row.active,
      district_id: row.district_id,
      office_id: row.office_id,
      property_id: row.property_id,
      transaction_type: row.transaction_type,
      service_type: row.service_type,
      status: row.status,
    })),
  );
});
app.get("/api/dashboard", async (req, res) => {
  const p = resourceMap.get("properties")!;
  const pv: unknown[] = [];
  const ps = scope(req.actor, p, pv);
  const properties = await pool.query(
    `SELECT count(*) AS total,count(*) FILTER(WHERE registration_status='registered') AS registered FROM properties r WHERE ${ps}`,
    pv,
  );
  const types = await pool.query(
    `SELECT property_type AS label,count(*) AS count FROM properties r WHERE ${ps} GROUP BY property_type ORDER BY count DESC`,
    pv,
  );
  const districts = await pool.query(
    `SELECT d.district_name AS label,count(*) AS count FROM properties r JOIN districts d ON d.id=r.district_id WHERE ${ps} GROUP BY d.district_name ORDER BY count DESC LIMIT 6`,
    pv,
  );
  const recent = await pool.query(
    `SELECT r.id,r.survey_no,r.property_type,r.location,r.registration_status,d.district_name FROM properties r JOIN districts d ON d.id=r.district_id WHERE ${ps} ORDER BY r.created_at DESC LIMIT 5`,
    pv,
  );
  let pending = "0",
    tax = "0",
    activity: unknown[] = [];
  if (canRead(req.actor, resourceMap.get("transactions")!)) {
    const values: unknown[] = [];
    const predicate = scope(
      req.actor,
      resourceMap.get("transactions")!,
      values,
    );
    pending = (
      await pool.query(
        `SELECT count(*) AS count FROM transactions r WHERE ${predicate} AND status='pending'`,
        values,
      )
    ).rows[0].count;
  }
  if (canRead(req.actor, resourceMap.get("tax_payments")!)) {
    const values: unknown[] = [];
    const predicate = scope(
      req.actor,
      resourceMap.get("tax_payments")!,
      values,
    );
    tax = (
      await pool.query(
        `SELECT coalesce(sum(amount),0) AS amount FROM tax_payments r WHERE ${predicate} AND payment_status='paid'`,
        values,
      )
    ).rows[0].amount;
  }
  if (canRead(req.actor, resourceMap.get("audit_events")!))
    activity = (
      await pool.query(
        "SELECT a.id,a.action,a.entity_type,a.occurred_at,u.username FROM audit_events a JOIN users u ON u.id=a.actor_id ORDER BY occurred_at DESC LIMIT 5",
      )
    ).rows;
  const owners = (
    await pool.query(
      req.actor.role === "owner"
        ? "SELECT count(*) AS count FROM owners WHERE id=$1"
        : "SELECT count(*) AS count FROM owners",
      req.actor.role === "owner" ? [req.actor.owner_id] : [],
    )
  ).rows[0].count;
  res.json({
    properties: properties.rows[0].total,
    registered: properties.rows[0].registered,
    owners,
    pending,
    tax,
    types: types.rows,
    districts: districts.rows,
    recent: recent.rows,
    activity,
  });
});

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
      r.key === "owners" && ["bank_verifier", "owner"].includes(req.actor.role)
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
  for (const key of ["property_id", "transaction_id", "owner_id"]) {
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
    rows: rows.map((row) => redact(req.actor, r, row)),
    total: Number(count),
    page,
    limit,
  });
});
app.get("/api/records/:key/:id", async (req, res) => {
  const r = getResource(req.params.key);
  validateId(req.params.id);
  const result = await transaction(async (client) =>
    redact(
      req.actor,
      r,
      await accessible(client, req.actor, r, String(req.params.id)),
    ),
  );
  res.json(result);
});
app.post("/api/records/:key", async (req, res) => {
  const r = getResource(req.params.key);
  demand(canWrite(req.actor, r), "You cannot create this record.", 403);
  const data = validateRecord(r, req.body?.data);
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
      `UPDATE ${r.key} SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(",")},updated_at=now() WHERE id=$${values.length} RETURNING *`,
      values,
    );
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
    await audit(client, req.actor, "delete", r.key, old.id);
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
  res.send(await readFile(path.join(config.uploads, document.file_key)));
});

app.get("/api/accounts", async (req, res) => {
  demand(
    req.actor.role === "administrator",
    "Administrator access is required.",
    403,
  );
  res.json(
    (
      await pool.query(
        "SELECT id,username,role,owner_id,officer_id,active FROM users ORDER BY created_at DESC",
      )
    ).rows,
  );
});
app.post("/api/accounts", async (req, res) => {
  demand(
    req.actor.role === "administrator",
    "Administrator access is required.",
    403,
  );
  const { username, password, role, owner_id, officer_id } = req.body ?? {};
  demand(
    typeof username === "string" && /^[a-zA-Z0-9@._+-]{3,100}$/.test(username),
    "Enter a valid username (3–100 letters, numbers or email characters).",
  );
  demand(
    typeof password === "string" &&
      password.length >= 12 &&
      password.length <= 128,
    "Passwords must contain 12–128 characters.",
  );
  demand(
    [
      "administrator",
      "owner",
      "survey_officer",
      "valuation_officer",
      "sub_registrar",
      "bank_verifier",
      "auditor",
    ].includes(role),
    "Select a valid role.",
  );
  if (role === "owner") validateId(owner_id);
  if (
    [
      "survey_officer",
      "valuation_officer",
      "sub_registrar",
      "auditor",
    ].includes(role)
  )
    validateId(officer_id);
  const result = await transaction(async (client) => {
    if (
      [
        "survey_officer",
        "valuation_officer",
        "sub_registrar",
        "auditor",
      ].includes(role)
    )
      demand(
        (
          await client.query(
            "SELECT id FROM officers WHERE id=$1 AND designation=$2 AND active=true",
            [officer_id, role],
          )
        ).rows.length,
        "The linked officer must be active and have the matching designation.",
      );
    const row = await insert(client, "users", {
      username: username.toLowerCase(),
      password_hash: hashPassword(password),
      role,
      owner_id: role === "owner" ? owner_id : null,
      officer_id: [
        "survey_officer",
        "valuation_officer",
        "sub_registrar",
        "auditor",
      ].includes(role)
        ? officer_id
        : null,
    });
    await audit(client, req.actor, "create", "users", row.id, { role });
    delete row.password_hash;
    return row;
  });
  res.status(201).json(result);
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
process.on("SIGTERM", () => server.close(() => void pool.end()));
process.on("SIGINT", () => server.close(() => void pool.end()));
