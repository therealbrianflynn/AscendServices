import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/guard";
import {
  WEBAUTHN_CEREMONY_COOKIE_NAME,
  clearCeremonyCookie,
} from "@/lib/auth/webauthn/ceremony-cookie";
import {
  finishPasskeyRegistration,
  type RegistrationRejection,
} from "@/lib/auth/webauthn/registration";
import { readJsonObject } from "@/lib/http/json-body";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";

export const dynamic = "force-dynamic";

/** A credential already bound to an account is a conflict, not a bad request. */
const REJECTION_STATUS: Record<RegistrationRejection, number> = {
  unknown_user: 401,
  challenge_invalid: 400,
  challenge_expired: 400,
  challenge_consumed: 400,
  verification_failed: 400,
  credential_already_registered: 409,
};

/**
 * POST /api/auth/passkey/register/verify — `{ response, label? }`
 *
 * Verifies the attestation response against the challenge issued by
 * `/register/options` and stores the credential's public half. The attestation
 * object itself is verified and discarded: it is never persisted or logged.
 */
export async function POST(request: Request) {
  const guarded = await requireSession();
  if (!guarded.ok) return guarded.response;

  const body = await readJsonObject(request);
  if (!body || typeof body.response !== "object" || body.response === null) {
    return json({ error: "invalid_body" }, 400);
  }

  const jar = await cookies();
  const ceremonyId = jar.get(WEBAUTHN_CEREMONY_COOKIE_NAME)?.value;
  if (!ceremonyId) {
    return json({ error: "ceremony_missing" }, 400);
  }

  const result = await finishPasskeyRegistration({
    userId: guarded.session.sub,
    ceremonyId,
    response: body.response as RegistrationResponseJSON,
    label: typeof body.label === "string" ? body.label : undefined,
  });

  // The challenge is spent either way; never leave a stale cookie behind.
  const response = result.ok
    ? json({ passkey: result.passkey }, 201)
    : json({ error: result.reason }, REJECTION_STATUS[result.reason]);
  clearCeremonyCookie(response);
  return response;
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}
