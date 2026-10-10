import test from "node:test";
import assert from "node:assert/strict";
import { validDate, validateRecord } from "../server/validation.js";
import {
  resourceMap,
  canRead,
  canWrite,
  type Actor,
} from "../server/resources.js";
import {
  hashPassword,
  verifyPassword,
  createSession,
  readSession,
} from "../server/auth.js";
import { randomUUID } from "node:crypto";

test("dates reject impossible days and accept leap days", () => {
  assert.equal(validDate("2024-02-29"), true);
  assert.equal(validDate("2025-02-29"), false);
  assert.equal(validDate("2026-04-31"), false);
  assert.equal(validDate("10/10/2026"), false);
});
test("shares preserve exact decimal values and reject excess precision", () => {
  const r = resourceMap.get("transaction_parties")!;
  const body = {
    transaction_id: randomUUID(),
    owner_id: randomUUID(),
    role: "transferee",
    share: "0.33333333",
  };
  assert.equal(validateRecord(r, body).share, "0.33333333");
  assert.throws(
    () => validateRecord(r, { ...body, share: "0.333333333" }),
    /decimal places/,
  );
  assert.throws(
    () => validateRecord(r, { ...body, share: "1.01" }),
    /exceed 1/,
  );
  assert.throws(() => validateRecord(r, { ...body, share: "0" }), /at least/);
});
test("approval fields cannot be set by a generic edit", () => {
  assert.throws(
    () =>
      validateRecord(
        resourceMap.get("transactions")!,
        { status: "approved" },
        true,
      ),
    /protected fields/,
  );
  assert.throws(
    () =>
      validateRecord(
        resourceMap.get("documents")!,
        { verification_status: "verified" },
        true,
      ),
    /protected fields/,
  );
});
test("money and tax years are validated rather than silently rounded", () => {
  const r = resourceMap.get("tax_payments")!;
  assert.throws(() => validateRecord(r, { amount: "0" }, true), /at least/);
  assert.throws(
    () => validateRecord(r, { amount: "1.001" }, true),
    /decimal places/,
  );
  assert.throws(() => validateRecord(r, { tax_year: "2300" }, true), /2200/);
});
test("bank and field officer roles have bounded write access", () => {
  const actor = (role: Actor["role"]): Actor => ({
    id: randomUUID(),
    username: "test",
    role,
    owner_id: null,
    officer_id: null,
  });
  assert.equal(
    canRead(actor("bank_verifier"), resourceMap.get("properties")!),
    true,
  );
  assert.equal(
    canRead(actor("bank_verifier"), resourceMap.get("documents")!),
    false,
  );
  assert.equal(
    canWrite(actor("survey_officer"), resourceMap.get("surveys")!),
    true,
  );
  assert.equal(
    canWrite(actor("survey_officer"), resourceMap.get("transactions")!),
    false,
  );
});
test("password hashes are salted and sessions reject tampering", () => {
  const password = "TestPassword@2026";
  const one = hashPassword(password),
    two = hashPassword(password);
  assert.notEqual(one, two);
  assert.equal(verifyPassword(password, one), true);
  assert.equal(verifyPassword("wrong", one), false);
  const id = randomUUID(),
    token = createSession(id);
  assert.equal(readSession(token), id);
  assert.equal(readSession(token + "a"), null);
  assert.equal(readSession("invalid"), null);
});
