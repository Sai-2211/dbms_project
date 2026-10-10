import type pg from "pg";
import { Decimal } from "decimal.js";
import { demand } from "./errors.js";
import { accessible, propertyAccess } from "./access.js";
import { resourceMap, type Actor, type Resource } from "./resources.js";

export const today = () => new Date().toISOString().slice(0, 10);
export async function audit(
  client: pg.PoolClient,
  actor: Actor,
  action: string,
  entity: string,
  id: string,
  summary: Record<string, unknown> = {},
) {
  await client.query(
    "INSERT INTO audit_events(actor_id,action,entity_type,entity_id,summary) VALUES($1,$2,$3,$4,$5)",
    [actor.id, action, entity, id, JSON.stringify(summary)],
  );
}
export async function insert(
  client: pg.PoolClient,
  table: string,
  data: Record<string, unknown>,
) {
  const keys = Object.keys(data);
  const result = await client.query(
    `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")}) RETURNING *`,
    Object.values(data),
  );
  return result.rows[0];
}
export async function registrar(
  client: pg.PoolClient,
  actor: Actor,
  officerId?: string,
) {
  demand(
    ["administrator", "sub_registrar"].includes(actor.role),
    "A sub-registrar must perform this action.",
    403,
  );
  const id = actor.role === "sub_registrar" ? actor.officer_id : officerId;
  demand(id, "Select the approving sub-registrar.");
  const { rows } = await client.query(
    "SELECT * FROM officers WHERE id=$1 AND active=true AND designation='sub_registrar'",
    [id],
  );
  demand(rows[0], "Select an active sub-registrar.");
  return rows[0];
}
export function immutable(resource: Resource, row: Record<string, unknown>) {
  return (
    (resource.key === "transactions" && row.status !== "pending") ||
    (resource.key === "documents" && row.verification_status !== "pending") ||
    (resource.key === "surveys" && row.survey_status === "completed") ||
    resource.key === "valuations" ||
    resource.key === "certificates" ||
    (resource.key === "tax_payments" && row.payment_status === "paid") ||
    (["applications", "mutations"].includes(resource.key) &&
      ["approved", "rejected"].includes(String(row.status))) ||
    (resource.key === "encumbrances" && row.status === "released")
  );
}
export async function validateRelations(
  client: pg.PoolClient,
  actor: Actor,
  resource: Resource,
  data: Record<string, unknown>,
  old?: Record<string, unknown>,
) {
  const merged = { ...old, ...data };
  if (merged.property_id)
    await propertyAccess(client, actor, String(merged.property_id));
  if (resource.key === "properties") {
    const office = await client.query(
      "SELECT district_id FROM offices WHERE id=$1",
      [merged.office_id],
    );
    demand(
      office.rows[0]?.district_id === merged.district_id,
      "The registration office must belong to the selected district.",
    );
    demand(
      !old || old.registration_status !== "registered",
      "Registered properties are maintained through surveys and mutations.",
      409,
    );
  }
  if (["surveys", "valuations"].includes(resource.key)) {
    const expected =
      resource.key === "surveys" ? "survey_officer" : "valuation_officer";
    if (actor.role === expected)
      demand(
        merged.officer_id === actor.officer_id,
        "Use your own linked officer profile.",
        403,
      );
    const { rows } = await client.query(
      "SELECT designation,active FROM officers WHERE id=$1",
      [merged.officer_id],
    );
    demand(
      rows[0]?.active && rows[0].designation === expected,
      `Select an active ${expected.replaceAll("_", " ")}.`,
    );
  }
  if (merged.transaction_id && resource.key !== "transaction_parties") {
    const tx = await accessible(
      client,
      actor,
      resourceMap.get("transactions")!,
      String(merged.transaction_id),
    );
    demand(
      tx.property_id === merged.property_id,
      "The transaction must belong to the selected property.",
    );
    if (resource.key === "documents")
      demand(
        tx.status === "pending",
        "Documents cannot be added or changed after a transaction is finalized.",
        409,
      );
  }
  if (resource.key === "transactions") {
    const { rows } = await client.query(
      "SELECT office_id,registration_status FROM properties WHERE id=$1",
      [merged.property_id],
    );
    demand(
      rows[0]?.office_id === merged.office_id,
      "The processing office must match the property office.",
    );
    if (merged.transaction_type === "registration")
      demand(
        rows[0].registration_status !== "registered",
        "This property is already registered.",
      );
    else
      demand(
        rows[0].registration_status === "registered",
        "Transfers require a registered property.",
      );
    demand(
      String(merged.transaction_date) <= today(),
      "A transaction date cannot be in the future.",
    );
    if (
      old &&
      (merged.property_id !== old.property_id ||
        merged.transaction_type !== old.transaction_type)
    ) {
      const parties = await client.query(
        "SELECT id FROM transaction_parties WHERE transaction_id=$1 LIMIT 1",
        [old.id],
      );
      const docs = await client.query(
        "SELECT id FROM documents WHERE transaction_id=$1 LIMIT 1",
        [old.id],
      );
      demand(
        !parties.rows.length && !docs.rows.length,
        "Remove pending parties/documents before changing the property or transaction type.",
      );
    }
  }
  if (resource.key === "encumbrances") {
    demand(
      !merged.end_date || String(merged.end_date) >= String(merged.start_date),
      "End date cannot precede start date.",
    );
    demand(
      merged.status !== "released" || merged.end_date,
      "A released claim requires an end date.",
    );
    if (merged.document_id) {
      const doc = await accessible(
        client,
        actor,
        resourceMap.get("documents")!,
        String(merged.document_id),
      );
      demand(
        doc.property_id === merged.property_id,
        "The document must belong to the selected property.",
      );
    }
  }
  if (resource.key === "transaction_parties") {
    if (old)
      demand(
        merged.transaction_id === old.transaction_id,
        "A party cannot be moved to another transaction.",
      );
    const tx = await accessible(
      client,
      actor,
      resourceMap.get("transactions")!,
      String(merged.transaction_id),
      true,
    );
    demand(
      tx.status === "pending",
      "Parties on a finalized transaction cannot change.",
      409,
    );
    demand(
      !(tx.transaction_type === "registration" && merged.role === "transferor"),
      "Initial registration has no transferor.",
    );
    if (actor.role === "owner" && merged.role === "transferor")
      demand(
        merged.owner_id === actor.owner_id,
        "You can only offer your own ownership share.",
        403,
      );
  }
  if (actor.role === "owner" && resource.key === "applications")
    demand(
      merged.applicant_owner_id === actor.owner_id,
      "Use your own applicant profile.",
      403,
    );
  if (resource.key === "applications" && merged.transaction_id) {
    demand(
      ["registration", "transfer"].includes(String(merged.service_type)),
      "Only registration/transfer applications can reference a transaction.",
    );
  }
  if (
    resource.key === "mutations" &&
    merged.mutation_type === "ownership_change"
  )
    demand(
      merged.transaction_id,
      "Ownership mutations must reference a transaction.",
    );
  if (resource.key === "certificates") {
    demand(
      String(merged.period_to) >= String(merged.period_from),
      "Certificate end date cannot precede start date.",
    );
    demand(
      String(merged.period_to) <= today(),
      "Certificate periods cannot extend into the future.",
    );
    if (merged.application_id) {
      const app = await accessible(
        client,
        actor,
        resourceMap.get("applications")!,
        String(merged.application_id),
      );
      demand(
        app.property_id === merged.property_id &&
          app.service_type === "encumbrance_certificate",
        "Select a certificate application for this property.",
      );
    }
  }
}

export async function approveTransfer(
  client: pg.PoolClient,
  actor: Actor,
  id: string,
  officerId?: string,
) {
  const officer = await registrar(client, actor, officerId);
  const tx = await accessible(
    client,
    actor,
    resourceMap.get("transactions")!,
    id,
    true,
  );
  demand(
    tx.status === "pending",
    "This transaction has already been finalized.",
    409,
  );
  demand(
    tx.office_id === officer.office_id,
    "The approving officer must belong to the processing office.",
  );
  const property = (
    await client.query("SELECT * FROM properties WHERE id=$1 FOR UPDATE", [
      tx.property_id,
    ])
  ).rows[0];
  const documents = (
    await client.query("SELECT * FROM documents WHERE transaction_id=$1", [id])
  ).rows;
  const requiredDeed =
    tx.transaction_type === "registration"
      ? "registration_deed"
      : `${tx.transaction_type}_deed`;
  demand(
    documents.some(
      (d) =>
        d.document_type === requiredDeed &&
        d.verification_status === "verified" &&
        d.file_key,
    ),
    "Upload and verify the matching deed before approval.",
  );
  demand(
    documents.every((d) => d.verification_status === "verified"),
    "Every attached document must be verified before approval.",
  );
  const claims = (
    await client.query(
      "SELECT id FROM encumbrances WHERE property_id=$1 AND status='active' AND encumbrance_type IN ('mortgage','lien','dispute')",
      [tx.property_id],
    )
  ).rows;
  demand(
    !claims.length,
    "Resolve active mortgages, liens or disputes before approving this transaction.",
    409,
  );
  const parties = (
    await client.query(
      "SELECT * FROM transaction_parties WHERE transaction_id=$1 ORDER BY owner_id",
      [id],
    )
  ).rows;
  const incoming = parties.filter((p) => p.role === "transferee");
  const outgoing = parties.filter((p) => p.role === "transferor");
  const sum = (items: { share: string }[]) =>
    items.reduce((a, b) => a.plus(b.share), new Decimal(0));
  demand(incoming.length, "Add at least one transferee.");
  const current = (
    await client.query(
      "SELECT * FROM ownerships WHERE property_id=$1 AND valid_to IS NULL ORDER BY owner_id FOR UPDATE",
      [tx.property_id],
    )
  ).rows;
  if (tx.transaction_type === "registration") {
    demand(
      property.registration_status !== "registered" && current.length === 0,
      "The property already has registered ownership.",
      409,
    );
    demand(
      outgoing.length === 0 && sum(incoming).equals(1),
      "Initial ownership shares must total exactly 1 (100%).",
    );
  } else {
    demand(
      property.registration_status === "registered" && sum(current).equals(1),
      "The current ownership record is incomplete.",
      409,
    );
    demand(
      outgoing.length && sum(outgoing).equals(sum(incoming)),
      "Transferor and transferee shares must match.",
    );
    demand(
      !outgoing.some((p) => incoming.some((q) => q.owner_id === p.owner_id)),
      "An owner cannot be both transferor and transferee on the same transaction.",
    );
    for (const party of outgoing) {
      const holding = current.find((h) => h.owner_id === party.owner_id);
      demand(
        holding && new Decimal(holding.share).greaterThanOrEqualTo(party.share),
        "A transferor no longer owns the requested share.",
        409,
      );
    }
  }
  demand(
    current.every((h) => String(h.valid_from) <= tx.transaction_date),
    "The transfer date precedes the current ownership period.",
  );
  const holdings = new Map<string, Decimal>(
    current.map((h) => [h.owner_id, new Decimal(h.share)]),
  );
  for (const p of outgoing)
    holdings.set(p.owner_id, holdings.get(p.owner_id)!.minus(p.share));
  for (const p of incoming)
    holdings.set(
      p.owner_id,
      (holdings.get(p.owner_id) ?? new Decimal(0)).plus(p.share),
    );
  demand(
    [...holdings.values()]
      .reduce((a, b) => a.plus(b), new Decimal(0))
      .equals(1),
    "Resulting ownership shares must total 100%.",
  );
  const affected = new Set(parties.map((p) => p.owner_id));
  for (const holding of current.filter((h) => affected.has(h.owner_id))) {
    await client.query(
      "UPDATE ownerships SET valid_to=$1,end_transaction_id=$2,updated_at=now() WHERE id=$3",
      [tx.transaction_date, id, holding.id],
    );
  }
  for (const ownerId of affected) {
    const share = holdings.get(ownerId)!;
    if (share.greaterThan(0))
      await insert(client, "ownerships", {
        property_id: tx.property_id,
        owner_id: ownerId,
        share: share.toString(),
        valid_from: tx.transaction_date,
        source_transaction_id: id,
      });
  }
  await client.query(
    "UPDATE transactions SET status='approved',approving_officer_id=$1,approval_date=$2,updated_at=now() WHERE id=$3",
    [officer.id, today(), id],
  );
  if (tx.transaction_type === "registration")
    await client.query(
      "UPDATE properties SET registration_status='registered',registration_date=$1,updated_at=now() WHERE id=$2",
      [tx.transaction_date, tx.property_id],
    );
  else
    await insert(client, "mutations", {
      property_id: tx.property_id,
      transaction_id: id,
      mutation_date: today(),
      mutation_type: "ownership_change",
      description: `Ownership updated through approved ${tx.transaction_type} transaction.`,
      status: "pending",
    });
  await client.query(
    "UPDATE applications SET status='approved',reviewing_officer_id=$1,updated_at=now() WHERE transaction_id=$2 AND status IN ('submitted','under_review')",
    [officer.id, id],
  );
  await audit(client, actor, "approve", "transactions", id, {
    type: tx.transaction_type,
    property_id: tx.property_id,
    party_count: parties.length,
  });
  return (await client.query("SELECT * FROM transactions WHERE id=$1", [id]))
    .rows[0];
}

export async function certificateSnapshot(
  client: pg.PoolClient,
  data: Record<string, unknown>,
) {
  const { rows } = await client.query(
    `SELECT id,encumbrance_type,claimant_name,start_date,end_date,status,details FROM encumbrances
    WHERE property_id=$1 AND start_date <= $3 AND (end_date IS NULL OR end_date >= $2) ORDER BY start_date`,
    [data.property_id, data.period_from, data.period_to],
  );
  return {
    period_from: data.period_from,
    period_to: data.period_to,
    claims: rows,
    issued_at: new Date().toISOString(),
    note: "Snapshot of records in this project database; not a government-issued legal certificate.",
  };
}
