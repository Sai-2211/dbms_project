import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { pool } from "./db.js";
import { scope } from "./access.js";
import { resources, resourceMap, canRead, type Actor } from "./resources.js";
import { authenticatedActor } from "./auth.js";
import { HttpError } from "./errors.js";

export function liveScope(actor: Actor, values: unknown[]) {
  if (actor.role === "administrator") return "true";
  if (actor.role === "auditor")
    return scope(actor, resourceMap.get("audit_events")!, values, "a");
  if (actor.role === "public_viewer") {
    const parcels =
      "(SELECT id FROM properties WHERE registration_status='registered')";
    return `((a.entity_type='properties' AND a.entity_id IN ${parcels})
      OR (a.entity_type='transactions' AND a.entity_id IN (SELECT id FROM transactions WHERE property_id IN ${parcels}))
      OR (a.entity_type='surveys' AND a.entity_id IN (SELECT id FROM surveys WHERE property_id IN ${parcels}))
      OR (a.entity_type='offices' AND a.entity_id IN (SELECT office_id FROM properties WHERE registration_status='registered'))
      OR (a.entity_type='districts' AND a.entity_id IN (SELECT district_id FROM properties WHERE registration_status='registered')))`;
  }
  values.push(actor.id);
  const conditions = [`a.actor_id=$${values.length}`];
  for (const resource of resources.filter(
    (r) => r.key !== "audit_events" && canRead(actor, r),
  )) {
    const predicate = scope(actor, resource, values, "visible");
    conditions.push(
      `(a.entity_type='${resource.key}' AND a.entity_id IN (SELECT visible.id FROM ${resource.key} visible WHERE (${predicate})))`,
    );
  }
  // Deleted rows no longer join to a resource. Their captured jurisdiction can still invalidate a view.
  if (actor.officer_id) {
    values.push(actor.officer_id);
    const readable = resources
      .filter((r) => canRead(actor, r))
      .map((r) => `'${r.key}'`)
      .join(",");
    conditions.push(
      `(a.entity_type IN (${readable}) AND a.summary->>'office_id'=(SELECT office_id::STRING FROM officers WHERE id=$${values.length} AND active=true))`,
    );
  }
  return `(${conditions.join(" OR ")})`;
}
export async function liveRevision(actor: Actor) {
  const values: unknown[] = [];
  const predicate = liveScope(actor, values);
  const row = (
    await pool.query(
      `SELECT count(*)::STRING AS n,max(occurred_at)::STRING AS latest,max(id::STRING) AS last_id FROM audit_events a WHERE (${predicate})`,
      values,
    )
  ).rows[0];
  // Only an opaque revision is sent. Never expose audit records, record IDs or counts through this channel.
  return createHash("sha256")
    .update(JSON.stringify([actor.role, actor.owner_id, actor.officer_id, row]))
    .digest("hex");
}
const connections = new Set<Response>();
export function closeLiveUpdates() {
  for (const response of connections) response.end();
}
export async function liveUpdates(req: Request, res: Response) {
  connections.add(res);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-store, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  let closed = false;
  let revision = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let heartbeat = Date.now();
  res.on("close", () => {
    closed = true;
    connections.delete(res);
    clearTimeout(timer);
  });
  async function tick() {
    try {
      const actor = await authenticatedActor(req);
      const next = await liveRevision(actor);
      if (closed) return;
      if (next !== revision) {
        revision = next;
        res.write(`event: refresh\nid: ${next}\ndata: {}\n\n`);
        heartbeat = Date.now();
      } else if (Date.now() - heartbeat >= 15000) {
        res.write(": heartbeat\n\n");
        heartbeat = Date.now();
      }
    } catch (error) {
      if (!closed) {
        if (error instanceof HttpError && error.status === 401)
          res.write("event: signed-out\ndata: {}\n\n");
        res.end();
      }
      return;
    }
    if (!closed) timer = setTimeout(() => void tick(), 1500);
  }
  await tick();
}
