import "dotenv/config";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function demoSeedEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (env.RENDER !== "true")
    throw new Error(
      "Use this command in the Render Shell. Locally, use npm run db:seed.",
    );
  if (!env.DATABASE_URL)
    throw new Error(
      "Set DATABASE_URL in the Render service environment first.",
    );
  const password = env.DEMO_ADMIN_PASSWORD || "";
  if (
    password.trim().length < 12 ||
    password.length > 128 ||
    password === "LandLedger@2026"
  )
    throw new Error(
      "Set a private DEMO_ADMIN_PASSWORD of 12–128 characters; the public local demo password is not allowed.",
    );
  // This explicit Shell command initializes fictional course data only.
  // Changing the child's mode never changes the running web service's mode.
  // seed.ts still refuses unrelated nonempty databases and never resets records.
  return { ...env, NODE_ENV: "development" };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", fileURLToPath(new URL("./seed.ts", import.meta.url))],
      {
        env: demoSeedEnvironment(process.env),
        stdio: "inherit",
      },
    );
    for (const signal of ["SIGTERM", "SIGINT"] as const)
      process.on(signal, () => child.kill(signal));
    child.on("error", () => {
      console.error("Could not start the demo initialization process.");
      process.exitCode = 1;
    });
    child.on("exit", (code) => {
      process.exitCode = code ?? 1;
    });
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
