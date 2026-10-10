import test from "node:test";
import assert from "node:assert/strict";
import { readConfig, checkConfig } from "../server/config.js";
import { demoSeedEnvironment } from "../server/bootstrap-demo.js";

const secureEnvironment = {
  RENDER: "true",
  RENDER_EXTERNAL_URL: "https://registry-example.onrender.com",
  NODE_ENV: "production",
  DATABASE_URL:
    "postgresql://test:test-only@database.example.test:26257/sai_2211?sslmode=verify-full",
  SESSION_SECRET: "test-only-session-secret-over-thirty-two-characters",
};

test("local configuration remains loopback-only and does not trust proxy headers", () => {
  const settings = readConfig({
    RENDER_EXTERNAL_URL: "https://unrelated.example.test",
  });
  assert.equal(settings.host, "127.0.0.1");
  assert.equal(settings.port, 3001);
  assert.equal(settings.origin, "http://127.0.0.1:5173");
  assert.equal(settings.trustProxy, false);
});

test("Render uses its assigned HTTPS origin, ingress hop and injected port", () => {
  const settings = readConfig({ ...secureEnvironment, PORT: "10000" });
  assert.doesNotThrow(() => checkConfig(settings));
  assert.equal(settings.origin, secureEnvironment.RENDER_EXTERNAL_URL);
  assert.equal(settings.host, "0.0.0.0");
  assert.equal(settings.port, 10000);
  assert.equal(settings.trustProxy, 1);
  assert.equal(settings.production, true);
});

test("custom domain and upload directory override Render defaults", () => {
  const settings = readConfig({
    ...secureEnvironment,
    APP_ORIGIN: "https://registry.example.test/",
    HOST: "127.0.0.1",
    UPLOAD_DIR: "/var/data/uploads",
  });
  assert.doesNotThrow(() => checkConfig(settings));
  assert.equal(settings.origin, "https://registry.example.test");
  assert.equal(settings.host, "127.0.0.1");
  assert.equal(settings.uploads, "/var/data/uploads");
});

test("production rejects insecure database TLS and non-HTTPS website origins", () => {
  for (const mode of ["", "disable", "require", "verify-ca"])
    assert.throws(
      () =>
        checkConfig(
          readConfig({
            ...secureEnvironment,
            DATABASE_URL: `postgresql://test:test-only@database.example.test/sai_2211${mode ? "?sslmode=" + mode : ""}`,
          }),
        ),
      /sslmode=verify-full/,
    );
  assert.throws(
    () =>
      checkConfig(
        readConfig({
          ...secureEnvironment,
          APP_ORIGIN: "http://registry.example.test",
        }),
      ),
    /HTTPS/,
  );
  const local = readConfig({
    DATABASE_URL:
      "postgresql://root@127.0.0.1:26257/landledger?sslmode=disable",
    SESSION_SECRET: secureEnvironment.SESSION_SECRET,
  });
  assert.doesNotThrow(() => checkConfig(local));
});

test("configuration errors reject malformed origins, ports and SQL password placeholders without leaking secrets", () => {
  for (const APP_ORIGIN of [
    "not-an-origin",
    "https://registry.example.test/path",
    "https://user:secret@registry.example.test",
    "https://registry.example.test?query=1",
    "ftp://registry.example.test",
  ])
    assert.throws(
      () => checkConfig(readConfig({ ...secureEnvironment, APP_ORIGIN })),
      /APP_ORIGIN/,
    );
  for (const PORT of ["0", "-1", "65536", "1.5", "not-a-port"])
    assert.throws(
      () => checkConfig(readConfig({ ...secureEnvironment, PORT })),
      /PORT/,
    );
  for (const DATABASE_URL of [
    "",
    "invalid-secret-url",
    "https://user:private-password@database.example.test",
    "postgresql://user:%3CENTER-SQL-USER-PASSWORD%3E@database.example.test/sai_2211?sslmode=verify-full",
  ])
    assert.throws(
      () => checkConfig(readConfig({ ...secureEnvironment, DATABASE_URL })),
      (error: Error) => {
        assert.doesNotMatch(
          error.message,
          /private-password|invalid-secret-url/,
        );
        return /DATABASE_URL|password placeholder/.test(error.message);
      },
    );
  for (const SESSION_SECRET of [
    "",
    "short",
    "replace-with-an-example-secret-not-for-deployment",
  ])
    assert.throws(
      () => checkConfig(readConfig({ ...secureEnvironment, SESSION_SECRET })),
      /SESSION_SECRET/,
    );
});

test("Render demo initialization requires an explicit private password and Render environment", () => {
  const env = {
    ...secureEnvironment,
    DEMO_ADMIN_PASSWORD: "TestPrivateDemo@2026",
  };
  assert.throws(
    () => demoSeedEnvironment({ ...env, RENDER: "false" }),
    /Render Shell/,
  );
  assert.throws(
    () => demoSeedEnvironment({ ...env, DATABASE_URL: "" }),
    /DATABASE_URL/,
  );
  for (const DEMO_ADMIN_PASSWORD of [
    "",
    "short",
    "LandLedger@2026",
    " ".repeat(12),
    "x".repeat(129),
  ])
    assert.throws(
      () => demoSeedEnvironment({ ...env, DEMO_ADMIN_PASSWORD }),
      /DEMO_ADMIN_PASSWORD/,
    );
  const child = demoSeedEnvironment(env);
  assert.equal(child.NODE_ENV, "development");
  assert.equal(
    env.NODE_ENV,
    "production",
    "The running service's mode is unchanged",
  );
  assert.equal(child.DATABASE_URL, env.DATABASE_URL);
});
