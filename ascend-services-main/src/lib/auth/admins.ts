import { prisma } from "@/lib/prisma";

import { ADMIN_ROLE } from "./roles";

/**
 * Oversight copies are a courtesy, not a mailing list: a ministry with an
 * unexpectedly large admin roster should not turn one assignment into a
 * hundred-recipient BCC.
 */
const ADMIN_BCC_LIMIT = 20;

/** Admins BCC'd on automated mail (Spec v6 §4: the connection email "BCCs Admins"). */
export async function listAdminEmails(limit: number = ADMIN_BCC_LIMIT): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { role: ADMIN_ROLE },
    select: { email: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  return admins.map((admin) => admin.email);
}
