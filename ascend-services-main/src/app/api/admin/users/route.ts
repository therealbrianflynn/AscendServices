import { NextResponse } from "next/server";

import { managedUserErrorResponse } from "@/lib/admin/managed-user-response";
import { parseManagedUser } from "@/lib/admin/managed-user";
import { createManagedUser } from "@/lib/admin/user-directory";
import { listAdminUsers } from "@/lib/admin/users";
import { requireRole } from "@/lib/auth/guard";
import { ADMIN_ROLE } from "@/lib/auth/roles";
import { log } from "@/lib/logger";
import { getServiceTypeOptions } from "@/lib/requests/service-types";

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

/**
 * POST /api/admin/users — add a member and email them a sign-in link.
 * New accounts are always active; deactivation is a later edit.
 */
export async function POST(request: Request) {
  const guarded = await requireRole(ADMIN_ROLE);
  if (!guarded.ok) return guarded.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const draft = parseManagedUser(body, getServiceTypeOptions());
    const created = await createManagedUser(
      { ...draft, active: true },
      guarded.session.sub,
    );
    return NextResponse.json(
      { status: "created", id: created.id, emailSent: created.emailSent },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    return managedUserErrorResponse(err, guarded.session.sub);
  }
}
