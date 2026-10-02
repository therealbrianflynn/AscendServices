import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/guard";
import { log } from "@/lib/logger";
import { assignRequestToVolunteer } from "@/lib/requests/assignment";
import { findVolunteerProfile } from "@/lib/volunteers/profile";

export const dynamic = "force-dynamic";

const REJECTION_STATUS = {
  not_found: 404,
  already_claimed: 409,
} as const;

/**
 * POST /api/board/requests/[id]/assign — a signed-in member claims a NEW
 * request from the Help Wanted board (Spec v6 §5).
 *
 * Assignment is self-service: the actor is always the assignee, so there is no
 * body to trust. The response carries the requester's street address, which is
 * why it is `no-store` and only ever reaches the volunteer who just claimed it.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guarded = await requireSession();
  if (!guarded.ok) return guarded.response;

  const volunteer = await findVolunteerProfile(guarded.session.sub);
  if (!volunteer) {
    // Signed cookie for an account that no longer exists.
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const result = await assignRequestToVolunteer({ requestId: id, volunteer });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.reason },
        { status: REJECTION_STATUS[result.reason] },
      );
    }

    return NextResponse.json(
      { request: result.request, connection_email: result.connectionEmail },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    log({
      level: "error",
      msg: "request_assign_failed",
      actorId: volunteer.id,
      requestId: id,
      error: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "request_assign_failed" }, { status: 500 });
  }
}
