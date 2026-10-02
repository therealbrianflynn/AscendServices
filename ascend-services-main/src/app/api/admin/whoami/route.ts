import { NextResponse } from "next/server";

import { requireRole, sessionIdentity } from "@/lib/auth/guard";
import { ADMIN_ROLE } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/whoami — ADMIN-only identity echo. Serves as the guard for the
 * admin surface until the admin pages land: 401 signed out, 403 for SERVER.
 */
export async function GET() {
  const guarded = await requireRole(ADMIN_ROLE);
  if (!guarded.ok) return guarded.response;

  return NextResponse.json({ user: sessionIdentity(guarded.session) });
}
