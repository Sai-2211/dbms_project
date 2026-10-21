import test from "node:test";
import assert from "node:assert/strict";
import { numberedLogin } from "../server/auto-accounts.js";

test("automatic profile accounts follow numbered role names and the chosen password convention", () => {
  for (const [role, prefix] of Object.entries({
    owner: "owner",
    survey_officer: "survey",
    valuation_officer: "valuation",
    sub_registrar: "subregistrar",
    bank_verifier: "bank",
    auditor: "audit",
  })) {
    const login = numberedLogin(role, []);
    assert.equal(login.username, `${prefix}1`);
    assert.equal(
      login.password,
      `${prefix[0].toUpperCase()}${prefix.slice(1)}1@landledger`,
    );
  }
});

test("number allocation preserves existing role prefixes and reserves retired usernames", () => {
  const accounts = [
    { username: "registrar1", role: "sub_registrar" },
    { username: "registrar2", role: "sub_registrar" },
    { username: "registrar3", role: "public_viewer" },
  ];
  assert.equal(numberedLogin("sub_registrar", accounts).username, "registrar4");
  assert.throws(() => numberedLogin("administrator", []), /supported/);
});
