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
import { HttpError } from "./errors.js";
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
export function createSession(userId: string) {
  const payload = Buffer.from(
    JSON.stringify({ id: userId, expires: Date.now() + 8 * 60 * 60 * 1000 }),
  ).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function readSession(token: string) {
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
    return typeof result.id === "string" && result.expires > Date.now()
      ? result.id
      : null;
  } catch {
    return null;
  }
}
export function setSession(res: Response, token: string) {
  res.cookie("landledger_session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: config.production,
    maxAge: 8 * 60 * 60 * 1000,
    path: "/",
  });
}
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const token = req.headers.cookie
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("landledger_session="))
    ?.slice("landledger_session=".length);
  const id = token && readSession(token);
  if (!id) throw new HttpError(401, "Please sign in to continue.");
  const { rows } = await pool.query(
    `SELECT u.id,u.username,u.role,u.owner_id,u.officer_id FROM users u
      WHERE u.id=$1 AND u.active=true AND (u.officer_id IS NULL OR EXISTS(
        SELECT 1 FROM officers o WHERE o.id=u.officer_id AND o.active=true AND o.designation=u.role))`,
    [id],
  );
  if (!rows[0]) throw new HttpError(401, "Your account is inactive.");
  req.actor = rows[0];
  next();
}
