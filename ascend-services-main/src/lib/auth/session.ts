import { createHmac, timingSafeEqual } from "node:crypto";

import { isAppRole, type AppRole } from "./roles";

export const SESSION_COOKIE_NAME = "ascend_session";

export interface SessionIdentity {
  /** User id (`User.id`). */
  sub: string;
  email: string;
  role: AppRole;
}

export interface SessionPayload extends SessionIdentity {
  /** Expiry as epoch seconds. */
  exp: number;
}

export interface SessionCookieOptions {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  secure: boolean;
  maxAge: number;
}

const SECONDS_PER_HOUR = 3600;

/**
 * Stateless session: `base64url(json).base64url(hmac-sha256)`. The payload is
 * readable but not forgeable, and carries no secrets — just id, email and role.
 */
export function signSession(
  identity: SessionIdentity,
  secret: string,
  ttlHours: number,
): string {
  const payload: SessionPayload = {
    ...identity,
    exp: Math.floor(Date.now() / 1000) + Math.round(ttlHours * SECONDS_PER_HOUR),
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function verifySession(value: string, secret: string): SessionPayload | null {
  if (typeof value !== "string" || value.length === 0) return null;

  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!body || !signature) return null;
  if (!signatureMatches(body, signature, secret)) return null;

  const payload = decodePayload(body);
  if (!payload) return null;
  if (payload.exp * 1000 <= Date.now()) return null;

  return payload;
}

export function sessionCookieOptions({
  ttlHours,
  secure,
}: {
  ttlHours: number;
  secure: boolean;
}): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge: Math.round(ttlHours * SECONDS_PER_HOUR),
  };
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function signatureMatches(body: string, signature: string, secret: string): boolean {
  const provided = Buffer.from(signature, "utf8");
  const expected = Buffer.from(sign(body, secret), "utf8");
  return (
    provided.byteLength === expected.byteLength && timingSafeEqual(provided, expected)
  );
}

function decodePayload(body: string): SessionPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const { sub, email, role, exp } = parsed as Record<string, unknown>;
  if (typeof sub !== "string" || sub.length === 0) return null;
  if (typeof email !== "string" || email.length === 0) return null;
  if (!isAppRole(role)) return null;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;

  return { sub, email, role, exp };
}
