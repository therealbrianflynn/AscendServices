/**
 * Absolute origin the app is served from (`APP_BASE_URL`). Shared by every
 * feature that has to mint a link a user will click — magic links, tracking
 * portal links — so they can never disagree about the origin.
 */
const DEFAULT_APP_BASE_URL = "http://localhost:3000";

export function getAppBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.APP_BASE_URL?.trim() || DEFAULT_APP_BASE_URL;
  try {
    return new URL(value).origin;
  } catch {
    throw new Error(`APP_BASE_URL must be an absolute URL (got "${value}")`);
  }
}
