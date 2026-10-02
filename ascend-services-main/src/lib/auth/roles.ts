/**
 * Application roles. Kept in lockstep with the Prisma `Role` enum
 * (see `prisma/schema.prisma`) so route guards and the database agree on the
 * exact set of values; `src/__tests__/auth-roles.test.ts` asserts the parity.
 */
export const APP_ROLES = ["SERVER", "ADMIN"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const SERVER_ROLE: AppRole = "SERVER";
export const ADMIN_ROLE: AppRole = "ADMIN";

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && (APP_ROLES as readonly string[]).includes(value);
}

export function parseAppRole(value: unknown): AppRole {
  if (!isAppRole(value)) {
    throw new Error(`Unknown role "${String(value)}"; expected ${APP_ROLES.join(" | ")}`);
  }
  return value;
}
