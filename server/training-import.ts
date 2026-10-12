import { readFile, mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import type pg from "pg";
import { Decimal } from "decimal.js";
import dataset from "../docs/data/manual-entry-records.json";
import { transaction } from "./db.js";
import { demand, HttpError } from "./errors.js";
import { resourceMap, type Actor } from "./resources.js";
import { validateRecord } from "./validation.js";
import {
  insert,
  audit,
  approveTransfer,
  validateRelations,
  updateSurveyBoundary,
  certificateSnapshot,
  registrar,
  today,
} from "./business.js";

export const trainingDatasetId = "tn-manual-entry-v1";
type Row = Record<string, any>;
export type TrainingImportReport = {
  status: "imported" | "already_imported";
  dataset: string;
  created: Record<string, number>;
  reusedDistricts: number;
  registeredProperties: number;
  currentOwnershipRows: number;
  historicalOwnershipRows: number;
  expectedApprovalFailures: number;
  uploadedDocuments: number;
  accountsCreated: number;
};

const records = dataset.records as {
  key: string;
  alias: string;
  values: Row;
}[];
const workflows = dataset.workflows as {
  alias: string;
  property: string;
  type: string;
  expected_status: string;
  blocked: boolean;
}[];
const markerQuery =
  "SELECT summary FROM audit_events WHERE action='import_training_dataset' AND summary->>'dataset'=$1 LIMIT 1";

/** Recover only the exact versioned fictional PDF; never substitute for a real uploaded document. */
export async function recoverTrainingAttachment(
  document: Row,
): Promise<Buffer | null> {
  if (
    !records.some(
      (r) =>
        r.key === "documents" && r.values.document_no === document.document_no,
    ) ||
    document.original_filename !== "Fictional-Training-Upload.pdf" ||
    document.media_type !== "application/pdf"
  )
    return null;
  const bytes = await readFile(
    new URL("../docs/Fictional-Training-Upload.pdf", import.meta.url),
  );
  return createHash("sha256").update(bytes).digest("hex") === document.sha256 &&
    Number(document.file_size) === bytes.length
    ? bytes
    : null;
}

async function existingImport(client: pg.PoolClient) {
  const row = (await client.query(markerQuery, [trainingDatasetId])).rows[0];
  return row
    ? ({
        ...row.summary.report,
        status: "already_imported",
      } as TrainingImportReport)
    : null;
}

/** Fixed fictional data only. Existing users/passwords and unrelated records are never changed. */
export async function importTrainingDataset(
  actor: Actor,
  uploadDirectory: string,
): Promise<TrainingImportReport> {
  demand(
    actor.role === "administrator",
    "Administrator access is required.",
    403,
  );
  const pdf = await readFile(
    new URL("../docs/Fictional-Training-Upload.pdf", import.meta.url),
  );
  const staged = new Map<string, { key: string; filename: string }>();
  let keepFiles = false;
  try {
    const report = await transaction(async (client) => {
      const previous = await existingImport(client);
      if (previous) return previous;

      // Refuse ambiguous existing training rows instead of merging or overwriting them.
      for (const [key, field] of [
        ["offices", "office_code"],
        ["owners", "identification_no"],
        ["properties", "survey_no"],
        ["documents", "document_no"],
        ["surveys", "survey_no"],
        ["tax_payments", "receipt_no"],
        ["certificates", "certificate_no"],
      ]) {
        const values = records
          .filter((r) => r.key === key)
          .map((r) => r.values[field]);
        const found = await client.query(
          `SELECT id FROM ${key} WHERE ${field}=ANY($1::STRING[]) LIMIT 1`,
          [values],
        );
        demand(
          !found.rows.length,
          "Some training identifiers already exist without a completed import. No records were changed. Review these records before importing the workbook again.",
          409,
        );
      }

      const rows = new Map<string, Row>();
      const created: Record<string, number> = {};
      let reusedDistricts = 0,
        expectedApprovalFailures = 0;
      const count = (key: string) => {
        created[key] = (created[key] || 0) + 1;
      };
      const officerFor = (propertyAlias: string) => {
        const property = rows.get(propertyAlias)!;
        const officer = rows.get(
          property.office_id === rows.get("OFF-CH")!.id ? "R-CH" : "R-TH",
        )!;
        demand(
          officer.office_id === property.office_id,
          "Training officer jurisdiction does not match.",
        );
        return officer;
      };
      const reviewMutation = async (
        row: Row,
        action: "approve" | "reject",
        officer: Row,
      ) => {
        await registrar(client, actor, officer.id);
        if (action === "approve" && row.mutation_type === "ownership_change") {
          const tx = (
            await client.query("SELECT status FROM transactions WHERE id=$1", [
              row.transaction_id,
            ])
          ).rows[0];
          demand(
            tx?.status === "approved",
            "Approve the related ownership transaction first.",
          );
        }
        await client.query(
          "UPDATE mutations SET status=$1,approving_officer_id=$2,updated_at=now() WHERE id=$3",
          [
            action === "approve" ? "approved" : "rejected",
            action === "approve" ? officer.id : null,
            row.id,
          ],
        );
        await audit(client, actor, action, "mutations", row.id);
      };

      for (const input of records) {
        const resource = resourceMap.get(input.key);
        demand(
          resource &&
            !["users", "ownerships", "audit_events"].includes(input.key),
          "Unsupported training entity.",
        );
        const values = { ...input.values };
        for (const field of resource.fields.filter(
          (f) => f.type === "reference",
        )) {
          const alias = values[field.key];
          if (alias) {
            demand(
              rows.has(alias),
              `Missing training reference for ${input.alias}.`,
            );
            values[field.key] = rows.get(alias)!.id;
          }
        }
        const data = validateRecord(resource, values);
        if (input.key === "districts") {
          const existing = (
            await client.query(
              "SELECT * FROM districts WHERE district_name=$1 AND state_name=$2",
              [data.district_name, data.state_name],
            )
          ).rows[0];
          if (existing) {
            rows.set(input.alias, existing);
            reusedDistricts++;
            continue;
          }
        }
        await validateRelations(client, actor, resource, data);
        if (input.key === "certificates") {
          const officer = officerFor(input.values.property_id);
          await registrar(client, actor, officer.id);
          data.issue_date = today();
          data.issuing_officer_id = officer.id;
          data.snapshot_summary = JSON.stringify(
            await certificateSnapshot(client, data),
          );
        }
        const row = await insert(client, input.key, data);
        rows.set(input.alias, row);
        count(input.key);
        await audit(client, actor, "create", input.key, row.id, {
          fields: Object.keys(data).filter((k) => k !== "snapshot_summary"),
          source: trainingDatasetId,
        });

        if (input.key === "surveys" && row.survey_status === "completed")
          await updateSurveyBoundary(client, row);
        if (
          input.key === "documents" &&
          !["DOC-T5", "DOC-T6"].includes(input.alias)
        ) {
          let file = staged.get(input.alias);
          if (!file) {
            await mkdir(uploadDirectory, { recursive: true });
            const key = `${randomUUID()}.pdf`;
            file = { key, filename: path.join(uploadDirectory, key) };
            staged.set(input.alias, file);
            await writeFile(file.filename, pdf, { flag: "wx", mode: 0o600 });
          }
          await client.query(
            "UPDATE documents SET file_key=$1,original_filename=$2,media_type=$3,file_size=$4,sha256=$5 WHERE id=$6",
            [
              file.key,
              "Fictional-Training-Upload.pdf",
              "application/pdf",
              pdf.length,
              createHash("sha256").update(pdf).digest("hex"),
              row.id,
            ],
          );
          await audit(client, actor, "upload", "documents", row.id, {
            format: "pdf",
            bytes: pdf.length,
            source: trainingDatasetId,
          });
          const officer = officerFor(input.values.property_id);
          await registrar(client, actor, officer.id);
          await client.query(
            "UPDATE documents SET verification_status='verified',verifying_officer_id=$1,verified_date=$2,updated_at=now() WHERE id=$3",
            [officer.id, today(), row.id],
          );
          await audit(client, actor, "approve", "documents", row.id, {
            source: trainingDatasetId,
          });
        }

        if (input.key === "mutations") {
          if (input.alias === "MUT-B1")
            await reviewMutation(
              row,
              "approve",
              officerFor(input.values.property_id),
            );
          if (input.alias === "MUT-C3")
            await reviewMutation(
              row,
              "reject",
              officerFor(input.values.property_id),
            );
        }
        if (input.key === "applications") {
          const workflow = workflows.find(
            (w) => `APP-${w.alias}` === input.alias,
          );
          const officer = officerFor(input.values.property_id);
          if (workflow && workflow.alias !== "T5") {
            await client.query(
              "UPDATE applications SET status='under_review',reviewing_officer_id=$1,updated_at=now() WHERE id=$2",
              [officer.id, row.id],
            );
            await audit(client, actor, "under_review", "applications", row.id);
          }
          if (workflow?.expected_status === "approved") {
            await approveTransfer(
              client,
              actor,
              rows.get(workflow.alias)!.id,
              officer.id,
            );
            if (workflow.type !== "registration") {
              const mutation = (
                await client.query(
                  "SELECT * FROM mutations WHERE transaction_id=$1 AND mutation_type='ownership_change'",
                  [rows.get(workflow.alias)!.id],
                )
              ).rows[0];
              demand(
                mutation,
                "Training transfer did not create its mutation.",
              );
              count("mutations");
              await reviewMutation(mutation, "approve", officer);
            }
          } else if (workflow?.expected_status === "rejected") {
            await client.query(
              "UPDATE documents SET verification_status='rejected',updated_at=now() WHERE id=$1",
              [rows.get(`DOC-${workflow.alias}`)!.id],
            );
            await audit(
              client,
              actor,
              "reject",
              "documents",
              rows.get(`DOC-${workflow.alias}`)!.id,
            );
            await client.query(
              "UPDATE transactions SET status='rejected',updated_at=now() WHERE id=$1",
              [rows.get(workflow.alias)!.id],
            );
            await client.query(
              "UPDATE applications SET status='rejected',reviewing_officer_id=$1,updated_at=now() WHERE id=$2",
              [officer.id, row.id],
            );
            await audit(
              client,
              actor,
              "reject",
              "transactions",
              rows.get(workflow.alias)!.id,
            );
          } else if (workflow) {
            let failure: unknown;
            try {
              await approveTransfer(
                client,
                actor,
                rows.get(workflow.alias)!.id,
                officer.id,
              );
            } catch (error) {
              failure = error;
            }
            const expected = workflow.blocked
              ? "Resolve active mortgages"
              : "Upload and verify the matching deed";
            demand(
              failure instanceof HttpError &&
                failure.message.startsWith(expected),
              "A training approval did not fail for the expected reason.",
              409,
            );
            expectedApprovalFailures++;
          }
          if (!workflow && input.alias.startsWith("APP-EC")) {
            await client.query(
              "UPDATE applications SET status='under_review',reviewing_officer_id=$1,updated_at=now() WHERE id=$2",
              [officer.id, row.id],
            );
            await audit(client, actor, "under_review", "applications", row.id);
          }
          if (input.alias === "APP-MUT-1") {
            demand(rows.get("MUT-B1"), "Complete the boundary mutation first.");
            await client.query(
              "UPDATE applications SET status='approved',reviewing_officer_id=$1,updated_at=now() WHERE id=$2",
              [officer.id, row.id],
            );
            await audit(client, actor, "approve", "applications", row.id);
          }
        }
        if (input.key === "certificates" && row.application_id) {
          await client.query(
            "UPDATE applications SET status='approved',reviewing_officer_id=$1,updated_at=now() WHERE id=$2",
            [row.issuing_officer_id, row.application_id],
          );
        }
      }

      const propertyIds = [1, 2, 3, 4, 5, 6].map((i) => rows.get(`P${i}`)!.id);
      const expectedStates: [string, string, Record<string, number>][] = [
        ["properties", "registration_status", { registered: 4, pending: 2 }],
        [
          "documents",
          "verification_status",
          { verified: 13, pending: 1, rejected: 1 },
        ],
        [
          "applications",
          "status",
          { approved: 12, submitted: 1, under_review: 1, rejected: 1 },
        ],
        ["mutations", "status", { approved: 6, pending: 1, rejected: 1 }],
        ["surveys", "survey_status", { completed: 6, scheduled: 2 }],
        ["tax_payments", "payment_status", { paid: 5, pending: 1, failed: 1 }],
        ["encumbrances", "status", { active: 3, released: 1 }],
      ];
      for (const [key, field, expected] of expectedStates) {
        const actual = (
          await client.query(
            `SELECT ${field} AS state,count(*) AS count FROM ${key} WHERE ${key === "properties" ? "id" : "property_id"}=ANY($1::UUID[]) GROUP BY ${field}`,
            [propertyIds],
          )
        ).rows;
        demand(
          actual.length === Object.keys(expected).length &&
            actual.every((row) => Number(row.count) === expected[row.state]),
          `Training ${key} state verification failed.`,
          409,
        );
      }
      const ownerships = (
        await client.query(
          "SELECT * FROM ownerships WHERE property_id=ANY($1::UUID[])",
          [propertyIds],
        )
      ).rows;
      demand(
        ownerships.length === 14 &&
          ownerships.filter((r) => r.valid_to === null).length === 8,
        "Training ownership history verification failed.",
        409,
      );
      for (const expected of dataset.expected.ownership_history) {
        demand(
          ownerships.some(
            (r) =>
              r.property_id === rows.get(expected.property)!.id &&
              r.owner_id === rows.get(expected.owner)!.id &&
              new Decimal(r.share).eq(expected.share) &&
              r.valid_from === expected.valid_from &&
              r.valid_to === expected.valid_to &&
              r.source_transaction_id ===
                rows.get(expected.source_transaction)!.id &&
              r.end_transaction_id ===
                (expected.end_transaction
                  ? rows.get(expected.end_transaction)!.id
                  : null),
          ),
          "Training ownership periods do not match the expected history.",
          409,
        );
      }
      created.ownerships = ownerships.length;
      for (const alias of ["P1", "P2", "P3", "P4"]) {
        const total = ownerships
          .filter((r) => r.property_id === rows.get(alias)!.id && !r.valid_to)
          .reduce((sum, r) => sum.plus(r.share), new Decimal(0));
        demand(total.eq(1), "Training ownership does not total 100%.", 409);
      }
      for (const [alias, area] of [
        ["P1", "245.4000"],
        ["P4", "2400.0000"],
      ]) {
        const row = (
          await client.query("SELECT area FROM properties WHERE id=$1", [
            rows.get(alias)!.id,
          ])
        ).rows[0];
        demand(
          new Decimal(row.area).eq(area),
          "Training survey history verification failed.",
          409,
        );
      }
      for (const [alias, claims] of Object.entries(
        dataset.expected.certificate_claims,
      )) {
        const stored = rows.get(alias)!.snapshot_summary;
        const snapshot =
          typeof stored === "string" ? JSON.parse(stored) : stored;
        demand(
          snapshot.claims.length === claims.length &&
            claims.every((claim) =>
              snapshot.claims.some((c: Row) => c.id === rows.get(claim)!.id),
            ),
          "Training certificate snapshot verification failed.",
          409,
        );
      }
      for (const workflow of workflows) {
        const row = (
          await client.query("SELECT status FROM transactions WHERE id=$1", [
            rows.get(workflow.alias)!.id,
          ])
        ).rows[0];
        demand(
          row.status === workflow.expected_status,
          "Training transaction status verification failed.",
          409,
        );
      }
      demand(
        expectedApprovalFailures === 2,
        "Expected blocked-case verification failed.",
        409,
      );
      const result: TrainingImportReport = {
        status: "imported",
        dataset: trainingDatasetId,
        created,
        reusedDistricts,
        registeredProperties: 4,
        currentOwnershipRows: 8,
        historicalOwnershipRows: 14,
        expectedApprovalFailures,
        uploadedDocuments: 13,
        accountsCreated: 0,
      };
      await audit(client, actor, "import_training_dataset", "users", actor.id, {
        dataset: trainingDatasetId,
        report: result,
      });
      return result;
    });
    keepFiles = report.status === "imported";
    return report;
  } finally {
    if (!keepFiles)
      await Promise.all(
        [...staged.values()].map((file) =>
          unlink(file.filename).catch(() => {}),
        ),
      );
  }
}
