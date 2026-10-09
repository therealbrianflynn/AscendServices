import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth/guard";
import { ADMIN_ROLE } from "@/lib/auth/roles";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/users/[id]/validation — `{ validated: boolean }`
 * Marks a member as a validated server, or clears that stamp.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guarded = await requireRole(ADMIN_ROLE);
  if (!guarded.ok) return guarded.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const validated =
    typeof body === "object" && body !== null && "validated" in body
      ? (body as { validated?: unknown }).validated
      : undefined;
  if (typeof validated !== "boolean") {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const { id } = await params;

  try {
    const existing = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    await prisma.user.update({
      where: { id },
      data: { validatedAt: validated ? new Date() : null },
    });
  } catch (err) {
    log({
      level: "error",
      msg: "server_validation_failed",
      error: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "validation_failed" }, { status: 500 });
  }

  return NextResponse.json({ status: "updated" });
}
