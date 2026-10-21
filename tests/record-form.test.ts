import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { updateRecordField } from "../src/recordForm.js";
import { resourceMap } from "../server/resources.js";
import { validateRecord } from "../server/validation.js";

test("selecting Coimbatore produces a valid office create and edit payload", () => {
  const office = resourceMap.get("offices")!;
  const district = randomUUID();
  const input = {
    office_name: "Peelamedu Demonstration Registry - CBE26",
    office_code: "CBE26-PMD-01",
    district_id: "",
    address: "12 Demonstration Road, Peelamedu, Coimbatore, Tamil Nadu",
    phone: "",
  };
  const created = updateRecordField(office, input, "district_id", district);
  assert.equal(validateRecord(office, created).district_id, district);
  assert.equal(Object.hasOwn(created, "office_id"), false);
  const replacement = randomUUID();
  const edited = updateRecordField(office, created, "district_id", replacement);
  assert.equal(validateRecord(office, edited, true).district_id, replacement);
});

test("changing a property's district clears its old registration office", () => {
  const updated = updateRecordField(
    resourceMap.get("properties")!,
    {
      district_id: randomUUID(),
      office_id: randomUUID(),
      survey_no: "CBE26-118/4B",
    },
    "district_id",
    randomUUID(),
  );
  assert.equal(updated.office_id, "");
  assert.equal(updated.survey_no, "CBE26-118/4B");
});

test("changing a document's property clears its previous transaction without adding unsupported fields", () => {
  const property = randomUUID();
  const input = {
    document_no: "CBE26-DEED-001",
    property_id: randomUUID(),
    transaction_id: randomUUID(),
    document_type: "registration_deed",
    document_date: "2026-10-20",
  };
  const updated = updateRecordField(
    resourceMap.get("documents")!,
    input,
    "property_id",
    property,
  );
  assert.equal(updated.transaction_id, "");
  assert.equal(
    validateRecord(resourceMap.get("documents")!, updated).property_id,
    property,
  );
  assert.deepEqual(Object.keys(updated).sort(), Object.keys(input).sort());
});

test("selecting a transaction property fills its processing office and clearing it clears the office", () => {
  const property = randomUUID(),
    office = randomUUID();
  const resource = resourceMap.get("transactions")!;
  const updated = updateRecordField(resource, {}, "property_id", property, [
    { id: property, office_id: office },
  ]);
  assert.equal(updated.office_id, office);
  assert.equal(
    updateRecordField(resource, updated, "property_id", "").office_id,
    "",
  );
});
