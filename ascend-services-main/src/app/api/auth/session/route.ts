import { NextResponse } from "next/server";

import { canOpenHelpBoard } from "@/lib/auth/board-access";
import { requireSession } from "@/lib/auth/guard";
import { ADMIN_ROLE } from "@/lib/auth/roles";
import { findVolunteerProfile } from "@/lib/volunteers/profile";

export const dynamic = "force-dynamic";

/** GET /api/auth/session — the caller's identity, or 401 when signed out. */
export async function GET() {
  const guarded = await requireSession();
  if (!guarded.ok) return guarded.response;

  const viewer = await findVolunteerProfile(guarded.session.sub);
  if (!viewer) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: viewer.id,
      email: viewer.email,
      role: viewer.role,
      admin: viewer.role === ADMIN_ROLE,
      board: canOpenHelpBoard(viewer),
    },
  });
}
