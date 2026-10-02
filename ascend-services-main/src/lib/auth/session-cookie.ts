/**
 * Writes and clears the signed session cookie. Every sign-in path — magic link
 * and passkey alike — goes through here, so a new path cannot accidentally mint
 * a session with different flags or a different TTL.
 */
import type { NextResponse } from "next/server";

import { log } from "@/lib/logger";

import type { AuthUser } from "./auth-user";
import { getAuthConfig } from "./config";
import { SESSION_COOKIE_NAME, sessionCookieOptions, signSession } from "./session";

export const SESSION_LOGIN_ACTION = "USER_LOGIN";
export const SESSION_LOGOUT_ACTION = "USER_LOGOUT";

export function attachSessionCookie<T extends NextResponse>(
  response: T,
  user: Pick<AuthUser, "id" | "email" | "role">,
  { method }: { method: string },
): T {
  const config = getAuthConfig();

  response.cookies.set(
    SESSION_COOKIE_NAME,
    signSession(
      { sub: user.id, email: user.email, role: user.role },
      config.sessionSecret,
      config.sessionTtlHours,
    ),
    sessionCookieOptions({
      ttlHours: config.sessionTtlHours,
      secure: config.cookieSecure,
    }),
  );

  log({
    msg: "session_established",
    action: SESSION_LOGIN_ACTION,
    actorId: user.id,
    method,
    ttlHours: config.sessionTtlHours,
  });

  return response;
}

export function clearSessionCookie<T extends NextResponse>(response: T): T {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...sessionCookieOptions({ ttlHours: 0, secure: getAuthConfig().cookieSecure }),
    maxAge: 0,
  });
  return response;
}
