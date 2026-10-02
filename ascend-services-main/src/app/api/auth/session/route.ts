import { NextResponse } from "next/server";

import { requireSession, sessionIdentity } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

/** GET /api/auth/session — the caller's identity, or 401 when signed out. */
export async function GET() {
  const guarded = await requireSession();
  if (!guarded.ok) return guarded.response;

  return NextResponse.json({ user: sessionIdentity(guarded.session) });
}
