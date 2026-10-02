import { NextResponse } from "next/server";

import { listAdminRequests } from "@/lib/admin/requests";
import { requireRole } from "@/lib/auth/guard";
import { ADMIN_ROLE } from "@/lib/auth/roles";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/requests — the admin console request grid (Spec v6 §6).
 *
 * ADMIN only, and `no-store`: the payload carries requester names, contact
 * addresses and street addresses. Failures log the error message alone — never
 * a row — so this PII cannot reach a log aggregator.
 */
export async function GET() {
  const guarded = await requireRole(ADMIN_ROLE);
  if (!guarded.ok) return guarded.response;

  try {
    const requests = await listAdminRequests();
    return NextResponse.json(
      { requests },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    log({
      level: "error",
      msg: "admin_request_list_failed",
      actorId: guarded.session.sub,
      error: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "admin_request_list_failed" }, { status: 500 });
  }
}
