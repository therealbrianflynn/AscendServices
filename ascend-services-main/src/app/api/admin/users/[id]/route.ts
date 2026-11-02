import { NextResponse } from "next/server";

import { managedUserErrorResponse } from "@/lib/admin/managed-user-response";
import { parseManagedUser } from "@/lib/admin/managed-user";
import { updateManagedUser } from "@/lib/admin/user-directory";
import { requireRole } from "@/lib/auth/guard";
import { ADMIN_ROLE } from "@/lib/auth/roles";
import { getServiceTypeOptions } from "@/lib/requests/service-types";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/users/[id] — edit personal data, access level, or deactivate.
 * ADMIN only.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guarded = await requireRole(ADMIN_ROLE);
  if (!guarded.ok) return guarded.response;

  const { id } = await params;
  if (typeof id !== "string" || id.length === 0) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const draft = parseManagedUser(body, getServiceTypeOptions());
    await updateManagedUser(id, draft, guarded.session.sub);
    return NextResponse.json(
      { status: "updated" },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    return managedUserErrorResponse(err, guarded.session.sub);
  }
}
