import { Router } from "express";
import { pool } from "./db.js";
import { demand } from "./errors.js";
import { uuidPattern } from "./validation.js";

// This projection is the public contract. Never select p.* or join owner records.
const projection = `p.id,p.survey_no,p.property_type,p.area::STRING AS area,
  d.district_name,d.state_name,o.office_name,p.registration_date,p.registration_status`;
const from = `FROM properties p JOIN districts d ON d.id=p.district_id
  JOIN offices o ON o.id=p.office_id`;

export const publicPortal = Router();
publicPortal.use((req, _res, next) => {
  demand(
    req.actor.role === "public_viewer" || req.actor.role === "administrator",
    "Public portal access is required.",
    403,
  );
  demand(
    req.method === "GET" || req.method === "HEAD",
    "The public portal is read-only.",
    403,
  );
  next();
});
publicPortal.get("/overview", async (_req, res) => {
  const [total, types, districts] = await Promise.all([
    pool.query(
      "SELECT count(*)::INT AS total FROM properties WHERE registration_status='registered'",
    ),
    pool.query(
      "SELECT property_type,count(*)::INT AS count FROM properties WHERE registration_status='registered' GROUP BY property_type ORDER BY property_type",
    ),
    pool.query(
      "SELECT d.id,d.district_name,d.state_name FROM districts d WHERE EXISTS (SELECT 1 FROM properties p WHERE p.district_id=d.id AND p.registration_status='registered') ORDER BY d.state_name,d.district_name,d.id",
    ),
  ]);
  res.json({
    total: Number(total.rows[0].total),
    types: types.rows.map((r) => ({ ...r, count: Number(r.count) })),
    districts: districts.rows,
  });
});
publicPortal.get("/properties", async (req, res) => {
  demand(
    Object.keys(req.query).every((k) =>
      ["q", "district", "page", "limit"].includes(k),
    ),
    "Unknown public search option.",
  );
  const { q = "", district = "", page = "1", limit = "12" } = req.query;
  demand(
    typeof q === "string" && q.length <= 200,
    "Search must contain at most 200 characters.",
  );
  demand(
    typeof district === "string" && (!district || uuidPattern.test(district)),
    "Select a valid district.",
  );
  demand(
    typeof page === "string" && /^[1-9]\d{0,5}$/.test(page),
    "Enter a valid page number.",
  );
  demand(
    typeof limit === "string" &&
      /^[1-9]\d?$/.test(limit) &&
      Number(limit) <= 50,
    "Page size must be 1–50.",
  );
  const values: unknown[] = [];
  let where = "p.registration_status='registered'";
  if (q.trim()) {
    // Escape LIKE metacharacters so searches are literal; SQL values stay bound.
    values.push(`%${q.trim().replace(/[\\%_]/g, "\\$&")}%`);
    where += ` AND (p.survey_no ILIKE $${values.length}
      OR p.property_type ILIKE $${values.length} OR d.district_name ILIKE $${values.length}
      OR d.state_name ILIKE $${values.length} OR o.office_name ILIKE $${values.length})`;
  }
  if (district) {
    values.push(district);
    where += ` AND p.district_id=$${values.length}`;
  }
  // One snapshot keeps row count and page contents consistent during registration changes.
  const result = await pool.query(
    `WITH visible AS (SELECT ${projection} ${from} WHERE ${where}),
    page_rows AS (SELECT * FROM visible ORDER BY survey_no,id LIMIT $${values.length + 1} OFFSET $${values.length + 2})
    SELECT (SELECT count(*) FROM visible)::INT AS total,
      COALESCE((SELECT jsonb_agg(page_rows ORDER BY survey_no,id) FROM page_rows),'[]'::JSONB) AS rows`,
    [...values, Number(limit), (Number(page) - 1) * Number(limit)],
  );
  res.json({
    rows: result.rows[0].rows,
    total: Number(result.rows[0].total),
    page: Number(page),
    limit: Number(limit),
  });
});
publicPortal.get("/properties/:id", async (req, res) => {
  const id = String(req.params.id);
  demand(uuidPattern.test(id), "Invalid property identifier.");
  const { rows } = await pool.query(
    `SELECT ${projection} ${from} WHERE p.id=$1 AND p.registration_status='registered'`,
    [id],
  );
  demand(rows[0], "Registered property not found.", 404);
  res.json(rows[0]);
});
