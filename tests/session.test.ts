import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { claimTabId } from "../src/session.js";
import {
  createSession,
  readSession,
  sessionCookieName,
} from "../server/auth.js";

test("browser tabs keep independent HttpOnly credential selectors, including duplicated tabs", async () => {
  const held = new Set<string>();
  const locks = {
    request: async (
      name: string,
      _options: unknown,
      callback: (lock: object | null) => unknown,
    ) => {
      if (held.has(name)) return callback(null);
      held.add(name);
      return callback({ name });
    },
  } as unknown as Pick<LockManager, "request">;
  const store = (initial?: string) => {
    const values = new Map(initial ? [["landledger.tab", initial]] : []);
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
  };
  const firstStore = store();
  const first = await claimTabId(firstStore, locks, randomUUID);
  const second = await claimTabId(store(), locks, randomUUID);
  assert.notEqual(first, second);
  const duplicate = await claimTabId(store(first), locks, randomUUID);
  assert.notEqual(
    duplicate,
    first,
    "A duplicate tab must not reuse the original tab's credentials",
  );
  held.delete(`landledger-tab-${first}`);
  assert.equal(
    await claimTabId(firstStore, locks, randomUUID),
    first,
    "Reloading a closed document preserves its tab login",
  );
});
test("browsers without Web Locks choose a fresh isolated identity instead of reusing cloned storage", async () => {
  const original = randomUUID();
  let stored: string = original;
  const id = await claimTabId(
    {
      getItem: () => stored,
      setItem: (_key, value) => {
        stored = value;
      },
    },
    undefined,
    randomUUID,
  );
  assert.notEqual(id, original);
  assert.equal(stored, id);
});
test("signed sessions are bound to the selected browser tab and legacy sessions remain separate", () => {
  const user = randomUUID(),
    first = randomUUID(),
    second = randomUUID();
  const token = createSession(user, first);
  assert.equal(readSession(token, first), user);
  assert.equal(readSession(token, second), null);
  assert.equal(readSession(token), null);
  assert.equal(readSession(createSession(user), first), null);
  assert.equal(readSession(createSession(user)), user);
  assert.notEqual(
    sessionCookieName({ headers: { "x-landledger-tab": first } }),
    sessionCookieName({ headers: { "x-landledger-tab": second } }),
  );
  assert.throws(() =>
    sessionCookieName({ headers: { "x-landledger-tab": "invalid; path=/" } }),
  );
});
