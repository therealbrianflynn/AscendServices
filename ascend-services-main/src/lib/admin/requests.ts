import { prisma } from "@/lib/prisma";
import {
  ADMIN_REQUEST_SELECT,
  toAdminRequestView,
  type AdminRequestView,
} from "@/lib/requests/views";

/**
 * One working screen of requests. The admin grid sorts and searches client
 * side, so the page size bounds the payload rather than the usefulness of the
 * view; server-side paging arrives with the SLA monitor if this ever outgrows it.
 */
export const ADMIN_REQUEST_LIMIT = 200;

/**
 * Every request, newest first — admins see the whole pipeline, not just the
 * open board. Callers are responsible for the `requireRole(ADMIN)` check; this
 * projection carries PII (see `ADMIN_REQUEST_SELECT`).
 */
export async function listAdminRequests(
  limit: number = ADMIN_REQUEST_LIMIT,
): Promise<AdminRequestView[]> {
  const records = await prisma.request.findMany({
    select: ADMIN_REQUEST_SELECT,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return records.map(toAdminRequestView);
}
