import { createHash, randomBytes } from "node:crypto";

/** 256 bits of entropy; url-safe so it can travel in a query string untouched. */
const TOKEN_BYTES = 32;

export function createMagicLinkToken(): string {
  return randomToken();
}

/**
 * Invite credential minted for a volunteer created by the CSV/XLSX import
 * (Spec v6 §3 `onboarding_token`). Same entropy as a sign-in token, because it
 * identifies an account nobody has signed into yet.
 */
export function createOnboardingToken(): string {
  return randomToken();
}

function randomToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Magic-link tokens are stored as a SHA-256 digest: a leaked database dump must
 * not hand out sign-in links. The raw token only ever exists in the email.
 */
export function hashMagicLinkToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function buildMagicLinkUrl(token: string, baseUrl: string): string {
  const url = new URL("/api/auth/callback", baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}
