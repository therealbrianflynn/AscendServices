import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { publicIdentity } from "@/lib/auth/auth-user";
import { attachSessionCookie } from "@/lib/auth/session-cookie";
import {
  WEBAUTHN_CEREMONY_COOKIE_NAME,
  clearCeremonyCookie,
} from "@/lib/auth/webauthn/ceremony-cookie";
import {
  PASSKEY_LOGIN_METHOD,
  finishPasskeyAuthentication,
} from "@/lib/auth/webauthn/authentication";
import { readJsonObject } from "@/lib/http/json-body";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/passkey/authenticate/verify — `{ response }`
 *
 * Verifies the assertion and, on success, issues the same signed httpOnly
 * session cookie the magic-link callback issues. Every rejection answers 401
 * with a stable code and no session.
 */
export async function POST(request: Request) {
  const body = await readJsonObject(request);
  if (!body || typeof body.response !== "object" || body.response === null) {
    return json({ error: "invalid_body" }, 400);
  }

  const jar = await cookies();
  const ceremonyId = jar.get(WEBAUTHN_CEREMONY_COOKIE_NAME)?.value;
  if (!ceremonyId) {
    return json({ error: "ceremony_missing" }, 400);
  }

  const result = await finishPasskeyAuthentication({
    ceremonyId,
    response: body.response as AuthenticationResponseJSON,
  });

  if (!result.ok) {
    return clearCeremonyCookie(json({ error: result.reason }, 401));
  }

  const response = json({ user: publicIdentity(result.user) }, 200);
  clearCeremonyCookie(response);
  return attachSessionCookie(response, result.user, { method: PASSKEY_LOGIN_METHOD });
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}
