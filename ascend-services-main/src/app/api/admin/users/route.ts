import { NextResponse } from "next/server";

import { listAdminUsers } from "@/lib/admin/users";
import { requireRole } from "@/lib/auth/guard";
import { ADMIN_ROLE } from "@/lib/auth/roles";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/users — the admin console member directory (Spec v6 §6).
 *
 * ADMIN only, and `no-store`: member email addresses are PII. Failures log the
 * error message alone, never a row.
 */
export async function GET() {
  const guarded = await requireRole(ADMIN_ROLE);
  if (!guarded.ok) return guarded.response;

  try {
    const users = await listAdminUsers();
    return NextResponse.json({ users }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    log({
      level: "error",
      msg: "admin_user_list_failed",
      actorId: guarded.session.sub,
      error: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "admin_user_list_failed" }, { status: 500 });
  }
}
