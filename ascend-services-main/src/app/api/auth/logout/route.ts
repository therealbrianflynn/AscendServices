import { NextResponse } from "next/server";

import { readSession } from "@/lib/auth/guard";
import { SESSION_LOGOUT_ACTION, clearSessionCookie } from "@/lib/auth/session-cookie";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** POST /api/auth/logout — expires the session cookie. Idempotent. */
export async function POST() {
  const session = await readSession();
  const response = clearSessionCookie(new NextResponse(null, { status: 204 }));

  if (session) {
    log({
      msg: "session_cleared",
      action: SESSION_LOGOUT_ACTION,
      actorId: session.sub,
    });
  }

  return response;
}
