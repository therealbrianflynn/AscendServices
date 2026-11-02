import { NextResponse } from "next/server";

import { getAuthConfig } from "@/lib/auth/config";
import { consumeMagicLink } from "@/lib/auth/magic-link";
import { AFTER_LOGIN_COOKIE, safeNextPath } from "@/lib/auth/return-path";
import { attachSessionCookie } from "@/lib/auth/session-cookie";

export const dynamic = "force-dynamic";

/** Recorded on the session so logs show which factor a member signed in with. */
const MAGIC_LINK_METHOD = "magic_link";

/**
 * GET /api/auth/callback?token=... — redeems the magic link and, on success,
 * sets the httpOnly session cookie before redirecting to the saved return path.
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

  const config = getAuthConfig();
  const returnTo = safeNextPath(cookieValue(request, AFTER_LOGIN_COOKIE)) ?? "/";
  const response = NextResponse.redirect(new URL(returnTo, config.appBaseUrl), 303);
  response.cookies.set(AFTER_LOGIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: config.cookieSecure,
    maxAge: 0,
  });
  return attachSessionCookie(response, result.user, { method: MAGIC_LINK_METHOD });
}

function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}
