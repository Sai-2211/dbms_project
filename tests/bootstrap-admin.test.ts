import test from "node:test";
import assert from "node:assert/strict";
import {
  administratorUsername,
  validateAdminConnection,
  validateAdministratorPassword,
} from "../server/bootstrap-admin.js";

test("administrator setup uses a fixed identity and requires a verified cloud URL", () => {
  assert.equal(administratorUsername, "admin@landledger.local");
  const value =
    "postgresql://sql_user:test%40only@database.example.test:26257/sai_2211?sslmode=verify-full";
  const url = validateAdminConnection(` ${value} `);
  assert.equal(url.hostname, "database.example.test");
  assert.equal(url.pathname, "/sai_2211");
  for (const suffix of [
    "",
    "?sslmode=disable",
    "?sslmode=require",
    "?sslmode=verify-ca",
    "?sslmode=verify-full&sslmode=disable",
  ])
    assert.throws(
      () =>
        validateAdminConnection(
          "postgresql://user:private-test@database.example.test/sai_2211" +
            suffix,
        ),
      /sslmode=verify-full/,
    );
});

test("administrator setup rejects malformed connections and placeholders without leaking SQL passwords", () => {
  for (const value of [
    "private-test-invalid-url",
    "https://user:private-test@database.example.test/sai_2211?sslmode=verify-full",
    "postgresql://user:private-test@database.example.test/?sslmode=verify-full",
    "postgresql://database.example.test/sai_2211?sslmode=verify-full",
    "postgresql://user:%3CENTER-SQL-USER-PASSWORD%3E@database.example.test/sai_2211?sslmode=verify-full",
    "postgresql://user:YOUR_SQL_PASSWORD@database.example.test/sai_2211?sslmode=verify-full",
    "postgresql://user:private-test@database.example.test/sai_2211?sslmode=verify-full#private-test",
  ])
    assert.throws(
      () => validateAdminConnection(value),
      (error: Error) => {
        assert.doesNotMatch(error.message, /private-test/);
        return true;
      },
    );
});

test("administrator setup requires a private bounded application password", () => {
  for (const password of [
    "",
    "short",
    " ".repeat(20),
    "x".repeat(129),
    "LandLedger@2026",
  ])
    assert.throws(
      () => validateAdministratorPassword(password),
      /private application password/,
    );
  assert.doesNotThrow(() => validateAdministratorPassword("TwelveChars!"));
  assert.doesNotThrow(() => validateAdministratorPassword("x".repeat(128)));
  assert.doesNotThrow(() =>
    validateAdministratorPassword("Test'\"Unicodeதமிழ்@2026"),
  );
});
