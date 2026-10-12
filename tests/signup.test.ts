import test from "node:test";
import assert from "node:assert/strict";
import { validatePublicSignup } from "../server/signup.js";
const password = "Public test தமிழ் password";
const input = {
  username: " Visitor@Example.test ",
  password,
  confirmation: password,
};

test("public signup normalizes usernames and preserves exact Unicode passwords", () => {
  assert.deepEqual(validatePublicSignup(input), {
    username: "visitor@example.test",
    password,
  });
});
test("public signup rejects malformed bodies, unknown fields and forged privilege/profile values", () => {
  for (const value of [
    null,
    undefined,
    [],
    "text",
    12,
    { ...input, role: "administrator" },
    { ...input, active: true },
    { ...input, owner_id: "some-id" },
    { ...input, officer_id: "some-id" },
    { ...input, password_hash: "forged" },
    JSON.parse(
      '{"username":"visitor","password":"password long enough","confirmation":"password long enough","__proto__":{}}',
    ),
  ]) {
    assert.throws(() => validatePublicSignup(value));
  }
});
test("public signup validates username bounds and protects initial department usernames", () => {
  for (const username of [
    "ab",
    "a".repeat(101),
    "bad username",
    "' OR 1=1 --",
    "<script>",
    "admin@landledger.local",
    " ADMIN@LANDLEDGER.LOCAL ",
    "registrar@landledger.local",
    42,
  ])
    assert.throws(() => validatePublicSignup({ ...input, username }));
});
test("public signup rejects short, oversized and whitespace passwords and mismatched confirmations", () => {
  for (const password of ["short", " ".repeat(12), "a".repeat(129), null, 123])
    assert.throws(() =>
      validatePublicSignup({ ...input, password, confirmation: password }),
    );
  assert.throws(() =>
    validatePublicSignup({ ...input, confirmation: password + "different" }),
  );
  assert.throws(() =>
    validatePublicSignup({ ...input, confirmation: undefined }),
  );
});
