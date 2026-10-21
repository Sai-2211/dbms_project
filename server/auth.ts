import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHmac,
} from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config.js";
import { pool } from "./db.js";
import type { Actor } from "./resources.js";
import { demand, HttpError } from "./errors.js";
declare global {
  namespace Express {
    interface Request {
      actor: Actor;
    }
  }
}
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, encoded: string) {
  const [salt, hash] = encoded.split(":");
  if (!/^[a-f0-9]{32}$/.test(salt || "") || !/^[a-f0-9]{128}$/.test(hash || ""))
    return false;
  return timingSafeEqual(
    Buffer.from(hash, "hex"),
    scryptSync(password, salt, 64),
  );
}
const signature = (payload: string) =>
  createHmac("sha256", config.sessionSecret)
    .update(payload)
    .digest("base64url");
export function createSession(userId: string, tabId?: string) {
  const payload = Buffer.from(
    JSON.stringify({
      id: userId,
      tab: tabId,
      expires: Date.now() + 8 * 60 * 60 * 1000,
    }),
  ).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function readSession(token: string, tabId?: string) {
  try {
    if (token.split(".").length !== 2) return null;
    const [payload, sig] = token.split(".");
    const expected = signature(payload);
    if (
      !sig ||
      sig.length !== expected.length ||
      !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    )
      return null;
    const result = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof result.id === "string" &&
      result.expires > Date.now() &&
      result.tab === tabId
      ? result.id
      : null;
  } catch {
    return null;
  }
}
export function requestTab(req?: Pick<Request, "headers">): string | undefined {
  const tab = req?.headers["x-landledger-tab"];
  demand(
    tab === undefined ||
      (typeof tab === "string" &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
          tab,
        )),
    "Invalid browser tab identifier.",
  );
  return tab as string | undefined;
}
export function sessionCookieName(req?: Pick<Request, "headers">) {
  const tab = requestTab(req);
  return tab ? `landledger_session_${tab}` : "landledger_session";
}
export function setSession(res: Response, token: string, req?: Request) {
  res.cookie(sessionCookieName(req), token, {
    httpOnly: true,
    sameSite: "strict",
    secure: config.production,
    maxAge: 8 * 60 * 60 * 1000,
    path: "/",
  });
}
export async function authenticatedActor(
  req: Pick<Request, "headers">,
): Promise<Actor> {
  const name = sessionCookieName(req);
  const token = req.headers.cookie
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  const id = token && readSession(token, requestTab(req));
  if (!id) throw new HttpError(401, "Please sign in to continue.");
  const { rows } = await pool.query(
    `SELECT u.id,u.username,u.role,u.owner_id,u.officer_id,n.owner_name FROM users u
      LEFT JOIN owners n ON n.id=u.owner_id AND u.role='owner'
      WHERE u.id=$1 AND u.active=true AND (u.officer_id IS NULL OR EXISTS(
        SELECT 1 FROM officers o WHERE o.id=u.officer_id AND o.active=true AND o.designation=u.role))`,
    [id],
  );
  if (!rows[0]) throw new HttpError(401, "Your account is inactive.");
  return rows[0];
}
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  req.actor = await authenticatedActor(req);
  next();
}
