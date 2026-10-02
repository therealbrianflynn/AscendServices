import { randomBytes } from "node:crypto";

/**
 * The tracking token is a bearer credential for the unauthenticated
 * self-service portal (Spec v6 §3), so it is generated with 192 bits of
 * entropy and url-safe characters. Unlike a magic-link token it is stored in
 * clear text: the portal is a long-lived lookup key the requester may return
 * to, not a one-shot login. It must never appear in logs or audit metadata.
 */
const TOKEN_BYTES = 24;

export const TRACKING_PORTAL_PATH = "/track";

export function createTrackingToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function buildTrackingPath(token: string): string {
  return `${TRACKING_PORTAL_PATH}/${encodeURIComponent(token)}`;
}

export function buildTrackingUrl(token: string, baseUrl: string): string {
  return new URL(buildTrackingPath(token), baseUrl).toString();
}

/**
 * Guards the portal route against obviously non-token path segments before a
 * database round trip.
 */
export function isWellFormedTrackingToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(value);
}
