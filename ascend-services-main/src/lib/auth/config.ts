/**
 * Auth configuration, read from the environment on every call so that a process
 * never caches a stale secret and tests can vary settings per case.
 * All keys are documented in `.env.example`; no value is hardcoded here beyond
 * safe local-development defaults.
 */
import { getAppBaseUrl } from "../app-url";

const DEFAULT_SESSION_TTL_HOURS = 24;
const DEFAULT_MAGIC_LINK_TTL_MINUTES = 15;
const MIN_SESSION_SECRET_LENGTH = 32;

export interface AuthConfig {
  sessionSecret: string;
  sessionTtlHours: number;
  magicLinkTtlMinutes: number;
  appBaseUrl: string;
  /** Session cookies are `Secure` whenever the app is served over HTTPS. */
  cookieSecure: boolean;
}

export function getAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const sessionSecret = env.AUTH_SESSION_SECRET?.trim() ?? "";
  if (sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error(
      `AUTH_SESSION_SECRET must be set to at least ${MIN_SESSION_SECRET_LENGTH} characters (see .env.example)`,
    );
  }

  const appBaseUrl = getAppBaseUrl(env);

  return {
    sessionSecret,
    sessionTtlHours: positiveNumber(
      env.AUTH_SESSION_TTL_HOURS,
      DEFAULT_SESSION_TTL_HOURS,
      "AUTH_SESSION_TTL_HOURS",
    ),
    magicLinkTtlMinutes: positiveNumber(
      env.MAGIC_LINK_TTL_MINUTES,
      DEFAULT_MAGIC_LINK_TTL_MINUTES,
      "MAGIC_LINK_TTL_MINUTES",
    ),
    appBaseUrl,
    cookieSecure: new URL(appBaseUrl).protocol === "https:",
  };
}

function positiveNumber(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number (got "${raw}")`);
  }
  return parsed;
}
