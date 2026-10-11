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
import { csvCell } from "../src/csv.js";

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

test("all editable fields reject missing required values, wrong primitive types and protected keys", () => {
  for (const resource of resourceMap.values()) {
    for (const field of resource.fields.filter((f) => !f.readOnly)) {
      if (field.required)
        for (const value of [null, "", "   "])
          assert.throws(
            () => validateRecord(resource, { [field.key]: value }, true),
            /required/,
            `${resource.key}.${field.key}`,
          );
      const invalid = field.type === "boolean" ? "true" : { nested: "value" };
      assert.throws(
        () => validateRecord(resource, { [field.key]: invalid }, true),
        Error,
        `${resource.key}.${field.key}`,
      );
      if (field.options)
        assert.throws(
          () => validateRecord(resource, { [field.key]: "unsupported" }, true),
          /valid/,
        );
      if (["text", "email", "textarea"].includes(field.type))
        assert.throws(
          () =>
            validateRecord(
              resource,
              {
                [field.key]: "x".repeat(field.type === "textarea" ? 5001 : 501),
              },
              true,
            ),
          /long/,
        );
    }
    for (const field of resource.fields.filter((f) => f.readOnly))
      assert.throws(
        () => validateRecord(resource, { [field.key]: "value" }, true),
        /protected/,
      );
    assert.throws(
      () => validateRecord(resource, { unknown_field: "value" }, true),
      /unsupported/,
    );
  }
});
test("decimal boundary inputs reject infinities, negative, exponential and overlarge values", () => {
  for (const value of [
    "Infinity",
    "NaN",
    "-0.1",
    "1e2",
    "1,000",
    "100000000000000",
    "0x10",
    true,
    [],
  ])
    assert.throws(() =>
      validateRecord(resourceMap.get("properties")!, { area: value }, true),
    );
  assert.equal(
    validateRecord(resourceMap.get("properties")!, { area: "0.0001" }, true)
      .area,
    "0.0001",
  );
  assert.equal(
    validateRecord(resourceMap.get("officers")!, { active: false }, true)
      .active,
    false,
  );
  assert.equal(
    validateRecord(resourceMap.get("owners")!, { email: "" }, true).email,
    null,
  );
});
test("text trims whitespace and preserves Unicode and HTML as plain data", () => {
  const r = resourceMap.get("districts")!;
  assert.equal(
    validateRecord(
      r,
      { district_name: "  தமிழ்நாடு <script>test</script>  " },
      true,
    ).district_name,
    "தமிழ்நாடு <script>test</script>",
  );
  assert.throws(
    () =>
      validateRecord(r, JSON.parse('{"__proto__":{"polluted":true}}'), true),
    /unsupported/,
  );
});
test("malformed password hashes and extra session token components fail safely", () => {
  assert.equal(verifyPassword("test", "a:" + "z".repeat(128)), false);
  assert.equal(verifyPassword("test", "malformed"), false);
  assert.equal(readSession(createSession(randomUUID()) + ".extra"), null);
});
test("CSV exports neutralize formulas including leading whitespace and quote cells", () => {
  for (const text of [
    "=1+1",
    "+1+1",
    "-1+1",
    "@SUM(1)",
    " =1+1",
    "\t=1+1",
    "\nformula",
  ])
    assert.equal(csvCell(text).startsWith("\"'"), true);
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell("Plain text"), '"Plain text"');
});

test("public users have no generic department resource permissions, even for broadly readable resources", () => {
  const actor: Actor = {
    id: randomUUID(),
    username: "test-public",
    role: "public_viewer",
    owner_id: null,
    officer_id: null,
  };
  for (const resource of resourceMap.values()) {
    assert.equal(canRead(actor, resource), false, resource.key);
    assert.equal(canWrite(actor, resource), false, resource.key);
  }
});
