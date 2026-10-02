/**
 * WebAuthn relying-party configuration, read from the environment on every call
 * so a process never caches a stale value and tests can vary settings per case.
 * All keys are documented in `.env.example`; the only defaults here are derived
 * from `APP_BASE_URL`, which the rest of the app already depends on.
 */
import { getAppBaseUrl } from "@/lib/app-url";

const DEFAULT_RP_NAME = "Ascend Services";
const DEFAULT_CHALLENGE_TTL_MINUTES = 5;

export interface WebAuthnConfig {
  /** Registrable domain the credential is scoped to — host only, no scheme/port. */
  rpId: string;
  /** Human-readable name shown by the authenticator's prompt. */
  rpName: string;
  /** Every origin allowed to complete a ceremony for `rpId`. */
  origins: string[];
  challengeTtlMinutes: number;
}

export class WebAuthnConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebAuthnConfigError";
  }
}

export function getWebAuthnConfig(env: NodeJS.ProcessEnv = process.env): WebAuthnConfig {
  const appBaseUrl = getAppBaseUrl(env);
  const rpId = normalizeRpId(env.WEBAUTHN_RP_ID, appBaseUrl);
  const origins = parseOrigins(env.WEBAUTHN_ORIGINS, appBaseUrl);

  for (const origin of origins) {
    assertOriginBelongsToRpId(origin, rpId);
  }

  return {
    rpId,
    rpName: env.WEBAUTHN_RP_NAME?.trim() || DEFAULT_RP_NAME,
    origins,
    challengeTtlMinutes: positiveNumber(
      env.WEBAUTHN_CHALLENGE_TTL_MINUTES,
      DEFAULT_CHALLENGE_TTL_MINUTES,
      "WEBAUTHN_CHALLENGE_TTL_MINUTES",
    ),
  };
}

function normalizeRpId(raw: string | undefined, appBaseUrl: string): string {
  const configured = raw?.trim() ?? "";
  if (configured.length === 0) return new URL(appBaseUrl).hostname;

  if (/[:/]/.test(configured)) {
    throw new WebAuthnConfigError(
      `WEBAUTHN_RP_ID must be a bare hostname without scheme, port or path (got "${configured}")`,
    );
  }
  return configured.toLowerCase();
}

function parseOrigins(raw: string | undefined, appBaseUrl: string): string[] {
  const configured = (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map(toOrigin);

  return configured.length > 0 ? Array.from(new Set(configured)) : [appBaseUrl];
}

/**
 * `new URL()` happily parses things like `localhost:3000` as a custom scheme
 * with an opaque origin, which would later surface as a confusing "Invalid URL"
 * from somewhere else. Only http(s) URLs describe a WebAuthn origin.
 */
function toOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new WebAuthnConfigError(
      `WEBAUTHN_ORIGINS entries must be absolute http(s) URLs (got "${value}")`,
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new WebAuthnConfigError(
      `WEBAUTHN_ORIGINS entries must be absolute http(s) URLs (got "${value}")`,
    );
  }
  return url.origin;
}

/**
 * A browser refuses any ceremony whose RP ID is not the origin's host or a
 * parent of it. Failing here turns a silent, confusing client-side error into a
 * startup-time configuration error.
 */
function assertOriginBelongsToRpId(origin: string, rpId: string): void {
  const { hostname } = new URL(origin);
  if (hostname === rpId || hostname.endsWith(`.${rpId}`)) return;

  throw new WebAuthnConfigError(
    `Origin "${origin}" cannot be used with WEBAUTHN_RP_ID "${rpId}"; the RP ID must equal the origin host or one of its parent domains`,
  );
}

function positiveNumber(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new WebAuthnConfigError(`${name} must be a positive number (got "${raw}")`);
  }
  return parsed;
}
