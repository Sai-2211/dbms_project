import { demand } from "./errors.js";

export function validatePublicSignup(body: unknown) {
  demand(
    body !== null && typeof body === "object" && !Array.isArray(body),
    "Enter your account details.",
  );
  const input = body as Record<string, unknown>;
  demand(
    Object.keys(input).every((key) =>
      ["username", "password", "confirmation"].includes(key),
    ),
    "Only username, password and confirmation are accepted.",
  );
  demand(typeof input.username === "string", "Enter a username.");
  const username = input.username.trim().toLowerCase();
  demand(
    /^[a-z0-9@._+-]{3,100}$/.test(username),
    "Use 3–100 letters, numbers or email characters for your username.",
  );
  // Keep the initial administrator and fictional department identities recoverable.
  demand(
    !username.endsWith("@landledger.local"),
    "This username is reserved for the registration department.",
  );
  demand(
    typeof input.password === "string" &&
      input.password.trim().length >= 12 &&
      input.password.length <= 128,
    "Choose a password of 12–128 characters.",
  );
  demand(
    typeof input.confirmation === "string" &&
      input.confirmation === input.password,
    "The passwords do not match.",
  );
  return { username, password: input.password };
}
