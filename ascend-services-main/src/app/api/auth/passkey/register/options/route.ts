import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/guard";
import { setCeremonyCookie } from "@/lib/auth/webauthn/ceremony-cookie";
import { startPasskeyRegistration } from "@/lib/auth/webauthn/registration";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/passkey/register/options — starts passkey enrolment for the
 * signed-in member. Enrolment is session-gated on purpose: the magic link is
 * how a member first proves who they are, and a passkey is added afterwards.
 */
export async function POST() {
  const guarded = await requireSession();
  if (!guarded.ok) return guarded.response;

  const started = await startPasskeyRegistration(guarded.session.sub);
  if (!started) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const response = NextResponse.json(
    { options: started.options },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
  setCeremonyCookie(response, started.ceremonyId, { expiresAt: started.expiresAt });
  return response;
}
