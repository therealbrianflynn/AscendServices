import { parseAppRole, type AppRole } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";

/**
 * What the admin console shows about a member. `onboarding_token` is absent on
 * purpose: it is a bearer credential, so it must never be selected onto a page
 * that lists every account.
 */
export const ADMIN_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  services_provided: true,
  validatedAt: true,
  createdAt: true,
} as const;

/** Mirrors `ADMIN_REQUEST_LIMIT`: one working screen, newest members first. */
export const ADMIN_USER_LIMIT = 200;

export interface AdminUserView {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  services_provided: string[];
  validated: boolean;
  createdAt: string;
}

export interface AdminUserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  services_provided: string[];
  validatedAt?: Date | null;
  createdAt: Date;
}

export function toAdminUserView(record: AdminUserRecord): AdminUserView {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    role: parseAppRole(record.role),
    services_provided: record.services_provided,
    validated: record.validatedAt != null,
    createdAt: record.createdAt.toISOString(),
  };
}

/**
 * The member directory. Callers are responsible for the `requireRole(ADMIN)`
 * check: email addresses are PII even inside the ministry.
 */
export async function listAdminUsers(
  limit: number = ADMIN_USER_LIMIT,
): Promise<AdminUserView[]> {
  const records = await prisma.user.findMany({
    select: ADMIN_USER_SELECT,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return records.map(toAdminUserView);
}
