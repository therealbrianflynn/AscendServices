import { prisma } from "@/lib/prisma";

import { ADMIN_ROLE } from "./roles";

/**
 * One message should not fan out across an unexpectedly large roster.
 * Active admins only: a deactivated account must not keep receiving mail.
 */
const ADMIN_BCC_LIMIT = 20;

/** Active admins on automated mail (connection copies and SLA alerts). */
export async function listAdminEmails(limit: number = ADMIN_BCC_LIMIT): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { role: ADMIN_ROLE, deactivatedAt: null },
    select: { email: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  return admins.map((admin) => admin.email);
}
