import { NextResponse } from "next/server";

import { getAuthConfig } from "@/lib/auth/config";
import { consumeMagicLink } from "@/lib/auth/magic-link";
import { attachSessionCookie } from "@/lib/auth/session-cookie";

export const dynamic = "force-dynamic";

/** Recorded on the session so logs show which factor a member signed in with. */
const MAGIC_LINK_METHOD = "magic_link";

/**
 * GET /api/auth/callback?token=... — redeems the magic link and, on success,
 * sets the httpOnly session cookie before redirecting to the app root.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const result = await consumeMagicLink(token);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }

  const response = NextResponse.redirect(new URL("/", getAuthConfig().appBaseUrl), 303);
  return attachSessionCookie(response, result.user, { method: MAGIC_LINK_METHOD });
}
