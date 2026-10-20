import type pg from "pg";
import { demand } from "./errors.js";
import type { Actor, Resource } from "./resources.js";
import { canRead } from "./resources.js";

export function ownerProperties(_actor: Actor, placeholder: string) {
  return `(SELECT property_id FROM ownerships WHERE owner_id=${placeholder} AND valid_to IS NULL
    UNION SELECT property_id FROM applications WHERE applicant_owner_id=${placeholder})`;
}
export function scope(
  actor: Actor,
  resource: Resource,
  values: unknown[],
  alias = "r",
): string {
  demand(
    canRead(actor, resource),
    "You do not have access to these records.",
    403,
  );
  if (actor.role === "administrator") return "true";
  if (actor.role !== "owner") {
    values.push(actor.officer_id);
    const officer = `$${values.length}`;
    const office = `(SELECT office_id FROM officers WHERE id=${officer} AND active=true AND designation='${actor.role}')`;
    let parcels = `(SELECT id FROM properties WHERE office_id=${office})`;
    // Surveyors see assigned parcels; valuers need office parcels to begin assessments.
    if (actor.role === "survey_officer")
      parcels = `(SELECT p.id FROM properties p JOIN surveys s ON s.property_id=p.id WHERE s.officer_id=${officer} AND p.office_id=${office})`;
    if (resource.key === "districts")
      return `${alias}.id IN (SELECT district_id FROM offices WHERE id=${office})`;
    if (resource.key === "offices") return `${alias}.id=${office}`;
    if (resource.key === "officers" && actor.role === "valuation_officer")
      return `${alias}.office_id=${office} AND (${alias}.id=${officer} OR ${alias}.designation='survey_officer')`;
    if (resource.key === "officers")
      return ["sub_registrar", "auditor"].includes(actor.role)
        ? `${alias}.office_id=${office}`
        : `${alias}.id=${officer} AND ${alias}.office_id=${office}`;
    if (resource.key === "owners")
      return `${alias}.id IN (SELECT owner_id FROM ownerships WHERE property_id IN ${parcels}
        UNION SELECT applicant_owner_id FROM applications WHERE property_id IN ${parcels}
        UNION SELECT tp.owner_id FROM transaction_parties tp JOIN transactions t ON t.id=tp.transaction_id WHERE t.property_id IN ${parcels}
        ${actor.role === "sub_registrar" ? `UNION SELECT a.entity_id FROM audit_events a JOIN users u ON u.id=a.actor_id JOIN officers o ON o.id=u.officer_id WHERE a.entity_type='owners' AND a.action='create' AND (a.summary->>'office_id'=${office}::STRING OR (a.summary->>'office_id' IS NULL AND o.office_id=${office}))` : ""})`;
    if (resource.key === "properties") return `${alias}.id IN ${parcels}`;
    if (resource.key === "transaction_parties")
      return `${alias}.transaction_id IN (SELECT id FROM transactions WHERE property_id IN ${parcels})`;
    if (resource.key === "audit_events") {
      // Audit visibility follows the affected record, including administrator actions.
      const entities = [
        "transactions",
        "documents",
        "surveys",
        "valuations",
        "tax_payments",
        "encumbrances",
        "mutations",
        "ownerships",
        "applications",
        "certificates",
      ];
      return (
        `((${alias}.entity_type!='users' AND ${alias}.summary->>'office_id'=${office}::STRING) OR ` +
        `(${alias}.summary->>'office_id' IS NULL AND (` +
        `(${alias}.entity_type='properties' AND ${alias}.entity_id IN ${parcels}) OR ` +
        `(${alias}.entity_type='offices' AND ${alias}.entity_id=${office}) OR ` +
        `(${alias}.entity_type='officers' AND ${alias}.entity_id IN (SELECT id FROM officers WHERE office_id=${office})) OR ` +
        `(${alias}.entity_type='transaction_parties' AND ${alias}.entity_id IN (SELECT tp.id FROM transaction_parties tp JOIN transactions t ON t.id=tp.transaction_id WHERE t.property_id IN ${parcels})) OR ` +
        entities
          .map(
            (key) =>
              `(${alias}.entity_type='${key}' AND ${alias}.entity_id IN (SELECT id FROM ${key} WHERE property_id IN ${parcels}))`,
          )
          .join(" OR ") +
        `)))`
      );
    }
    const own =
      ["surveys", "valuations"].includes(resource.key) &&
      actor.role ===
        (resource.key === "surveys" ? "survey_officer" : "valuation_officer")
        ? ` AND ${alias}.officer_id=${officer}`
        : "";
    return `${alias}.property_id IN ${parcels}${own}`;
  }
  if (["districts", "offices", "owners"].includes(resource.key)) return "true";
  values.push(actor.owner_id);
  const param = `$${values.length}`;
  if (resource.key === "properties")
    return `${alias}.id IN ${ownerProperties(actor, param)}`;
  if (resource.key === "applications")
    return `${alias}.applicant_owner_id=${param}`;
  if (resource.key === "transaction_parties")
    return `${alias}.transaction_id IN (SELECT id FROM transactions WHERE property_id IN ${ownerProperties(actor, param)})`;
  return `${alias}.property_id IN ${ownerProperties(actor, param)}`;
}
export function redact(
  actor: Actor,
  resource: Resource,
  row: Record<string, unknown>,
) {
  const safe = { ...row };
  delete safe.password_hash;
  delete safe.file_key;
  if (
    resource.key === "owners" &&
    (["bank_verifier", "auditor"].includes(actor.role) ||
      (actor.role === "owner" && row.id !== actor.owner_id))
  ) {
    for (const key of ["identification_no", "address", "phone", "email"])
      delete safe[key];
  }
  if (
    resource.key === "officers" &&
    !["administrator", "sub_registrar", "auditor"].includes(actor.role) &&
    row.id !== actor.officer_id
  ) {
    delete safe.email;
    delete safe.phone;
  }
  return safe;
}
export async function accessible(
  client: pg.PoolClient,
  actor: Actor,
  resource: Resource,
  id: string,
  lock = false,
) {
  const values: unknown[] = [id];
  const predicate = scope(actor, resource, values);
  const { rows } = await client.query(
    `SELECT r.*${resource.key === "audit_events" ? "" : ",r.updated_at::STRING AS _version"} FROM ${resource.key} r WHERE r.id=$1 AND ${predicate}${lock ? " FOR UPDATE" : ""}`,
    values,
  );
  demand(rows[0], "Record not found or inaccessible.", 404);
  return rows[0];
}
export async function propertyAccess(
  client: pg.PoolClient,
  actor: Actor,
  id: string,
) {
  const { resourceMap } = await import("./resources.js");
  return accessible(client, actor, resourceMap.get("properties")!, id);
}
