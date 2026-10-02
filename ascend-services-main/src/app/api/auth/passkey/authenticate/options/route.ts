import { NextResponse } from "next/server";

import { setCeremonyCookie } from "@/lib/auth/webauthn/ceremony-cookie";
import { startPasskeyAuthentication } from "@/lib/auth/webauthn/authentication";
import { readJsonObject } from "@/lib/http/json-body";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/passkey/authenticate/options — `{ email? }`
 *
 * The email is an optional hint that narrows the ceremony to one member's
 * credentials. Unknown and malformed addresses get the same discoverable
 * ceremony a blank one does, so the response cannot be used to enumerate
 * members.
 */
export async function POST(request: Request) {
  const body = await readJsonObject(request);
  const email = typeof body?.email === "string" ? body.email : undefined;

  const started = await startPasskeyAuthentication({ email });

  const response = NextResponse.json(
    { options: started.options },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
  setCeremonyCookie(response, started.ceremonyId, { expiresAt: started.expiresAt });
  return response;
}
