import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth/guard";
import { ADMIN_ROLE } from "@/lib/auth/roles";
import { parseCommunityEvent } from "@/lib/community/content";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** POST /api/admin/events — add a community event. */
export async function POST(request: Request) {
  const guarded = await requireRole(ADMIN_ROLE);
  if (!guarded.ok) return guarded.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = parseCommunityEvent(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid", fields: parsed.fields }, { status: 400 });
  }

  try {
    await prisma.communityEvent.create({ data: parsed.value });
  } catch (err) {
    log({
      level: "error",
      msg: "event_create_failed",
      error: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "event_create_failed" }, { status: 500 });
  }

  return NextResponse.json({ status: "saved" }, { status: 201 });
}
