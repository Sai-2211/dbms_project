import type pg from "pg";
import { demand } from "./errors.js";
import type { Actor, Resource } from "./resources.js";
import { canRead } from "./resources.js";

export function ownerProperties(actor: Actor, placeholder: string) {
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
  if (actor.role !== "owner") return "true";
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
    (actor.role === "bank_verifier" ||
      (actor.role === "owner" && row.id !== actor.owner_id))
  ) {
    for (const key of ["identification_no", "address", "phone", "email"])
      delete safe[key];
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
    `SELECT r.* FROM ${resource.key} r WHERE r.id=$1 AND ${predicate}${lock ? " FOR UPDATE" : ""}`,
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
