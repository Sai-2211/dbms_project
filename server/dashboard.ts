import { pool } from "./db.js";
import { redact, scope } from "./access.js";
import {
  resources,
  resourceMap,
  canRead,
  canReview,
  type Actor,
} from "./resources.js";

export async function dashboard(actor: Actor) {
  const counts: Record<string, string> = {};
  await Promise.all(
    resources
      .filter((r) => canRead(actor, r))
      .map(async (resource) => {
        const values: unknown[] = [];
        const predicate = scope(actor, resource, values);
        counts[resource.key] = (
          await pool.query(
            `SELECT count(*) AS n FROM ${resource.key} r WHERE ${predicate}`,
            values,
          )
        ).rows[0].n;
      }),
  );
  const values: unknown[] = [];
  const predicate = scope(actor, resourceMap.get("properties")!, values);
  const properties = (
    await pool.query(
      `SELECT count(*) AS total,count(*) FILTER(WHERE registration_status='registered') AS registered FROM properties r WHERE ${predicate}`,
      values,
    )
  ).rows[0];
  const types = (
    await pool.query(
      `SELECT property_type AS label,count(*) AS count FROM properties r WHERE ${predicate} GROUP BY property_type ORDER BY count DESC`,
      values,
    )
  ).rows;
  const districts = (
    await pool.query(
      `SELECT d.district_name AS label,count(*) AS count FROM properties r JOIN districts d ON d.id=r.district_id WHERE ${predicate} GROUP BY d.district_name ORDER BY count DESC LIMIT 6`,
      values,
    )
  ).rows;
  const recent = (
    await pool.query(
      `SELECT r.id,r.survey_no,r.property_type,r.location,r.registration_status,d.district_name FROM properties r JOIN districts d ON d.id=r.district_id WHERE ${predicate} ORDER BY r.created_at DESC,r.id LIMIT 5`,
      values,
    )
  ).rows;
  const work: {
    resource: string;
    title: string;
    count: string;
    action: string;
    rows: Record<string, unknown>[];
    create?: boolean;
  }[] = [];
  const queues = [
    ["transactions", "Pending transactions", "status='pending'"],
    [
      "documents",
      "Documents awaiting verification",
      "verification_status='pending'",
    ],
    ["mutations", "Pending mutations", "status='pending'"],
    [
      "applications",
      "Open service applications",
      "status IN ('submitted','under_review')",
    ],
    ["surveys", "Scheduled surveys", "survey_status='scheduled'"],
  ];
  for (const [key, title, condition] of queues) {
    const resource = resourceMap.get(key)!;
    if (!canRead(actor, resource)) continue;
    // Bank and auditors have no approval inbox. Their readable records remain available below.
    if (["bank_verifier", "auditor"].includes(actor.role)) continue;
    const parameters: unknown[] = [];
    const filter = scope(actor, resource, parameters);
    const count = (
      await pool.query(
        `SELECT count(*) AS n FROM ${key} r WHERE (${filter}) AND ${condition}`,
        parameters,
      )
    ).rows[0].n;
    const rows = (
      await pool.query(
        `SELECT r.* FROM ${key} r WHERE (${filter}) AND ${condition} ORDER BY r.created_at,r.id LIMIT 8`,
        parameters,
      )
    ).rows.map((r) => redact(actor, resource, r));
    work.push({
      resource: key,
      title,
      count,
      action: canReview(actor, resource)
        ? "Review"
        : key === "surveys" &&
            ["administrator", "survey_officer"].includes(actor.role)
          ? "Complete survey"
          : "Track progress",
      rows,
    });
  }
  if (["administrator", "valuation_officer"].includes(actor.role)) {
    const filter = `(${predicate}) AND NOT EXISTS(SELECT 1 FROM valuations v WHERE v.property_id=r.id)`;
    const count = (
      await pool.query(
        `SELECT count(*) AS n FROM properties r WHERE ${filter}`,
        values,
      )
    ).rows[0].n;
    const rows = (
      await pool.query(
        `SELECT r.* FROM properties r WHERE ${filter} ORDER BY r.created_at,r.id LIMIT 8`,
        values,
      )
    ).rows;
    work.push({
      resource: "valuations",
      title: "Parcels without a valuation",
      count,
      action: "Record valuation",
      rows,
      create: true,
    });
  }
  let activity: Record<string, unknown>[] = [];
  if (canRead(actor, resourceMap.get("audit_events")!)) {
    const parameters: unknown[] = [];
    const filter = scope(
      actor,
      resourceMap.get("audit_events")!,
      parameters,
      "a",
    );
    activity = (
      await pool.query(
        `SELECT a.id,a.action,a.entity_type,a.occurred_at,u.username FROM audit_events a JOIN users u ON u.id=a.actor_id WHERE (${filter}) ORDER BY a.occurred_at DESC,a.id LIMIT 5`,
        parameters,
      )
    ).rows;
  }
  let profile = null;
  if (actor.officer_id)
    profile =
      (
        await pool.query(
          "SELECT o.officer_name,o.designation,o.email,o.phone,f.office_name FROM officers o JOIN offices f ON f.id=o.office_id WHERE o.id=$1 AND o.active=true AND o.designation=$2",
          [actor.officer_id, actor.role],
        )
      ).rows[0] ?? null;
  let tax = "0";
  if (canRead(actor, resourceMap.get("tax_payments")!)) {
    const parameters: unknown[] = [];
    const filter = scope(actor, resourceMap.get("tax_payments")!, parameters);
    tax = (
      await pool.query(
        `SELECT coalesce(sum(amount),0) AS total FROM tax_payments r WHERE (${filter}) AND payment_status='paid'`,
        parameters,
      )
    ).rows[0].total;
  }
  let accounts = null;
  if (actor.role === "administrator") {
    accounts = (
      await pool.query(`SELECT count(*) AS total,count(*) FILTER(WHERE active=true) AS active,
      (SELECT count(*) FROM officers o WHERE o.active=true AND NOT EXISTS(SELECT 1 FROM users u WHERE u.officer_id=o.id AND u.active=true)) AS uncovered_officers,
      count(*) FILTER(WHERE active=true AND role IN ('survey_officer','valuation_officer','sub_registrar','bank_verifier','auditor') AND officer_id IS NULL) AS unlinked_staff
      FROM users`)
    ).rows[0];
  }
  return {
    properties: properties.total,
    registered: properties.registered,
    owners: actor.role === "owner" ? "1" : (counts.owners ?? "0"),
    pending: work.find((q) => q.resource === "transactions")?.count ?? "0",
    tax,
    counts,
    types,
    districts,
    recent,
    activity,
    work,
    profile,
    accounts,
    needsProfile: !["administrator", "owner"].includes(actor.role) && !profile,
  };
}
