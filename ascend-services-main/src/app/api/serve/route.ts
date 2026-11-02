import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/guard";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getServiceTypeOptions } from "@/lib/requests/service-types";
import { serveStep } from "@/lib/serve/access";
import { parseServeApplication } from "@/lib/serve/application";
import { BACKGROUND_CHECK_URL } from "@/lib/serve/background-check";
import { ServeSignupError, submitServeApplication } from "@/lib/serve/submit";
import { findVolunteerProfile } from "@/lib/volunteers/profile";

export const dynamic = "force-dynamic";

/** POST /api/serve — save a serve application for a signed-in passkey holder. */
export async function POST(request: Request) {
  const guarded = await requireSession();
  if (!guarded.ok) return guarded.response;

  const viewer = await findVolunteerProfile(guarded.session.sub);
  if (!viewer) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let passkeyCount = 0;
  try {
    passkeyCount = await prisma.passkeyCredential.count({ where: { userId: viewer.id } });
  } catch (err) {
    log({
      level: "error",
      msg: "serve_passkey_count_failed",
      error: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "serve_signup_failed" }, { status: 500 });
  }

  if (serveStep({ signedIn: true, passkeyCount }) !== "offer") {
    return NextResponse.json({ error: "passkey_required" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = parseServeApplication(body, getServiceTypeOptions(), viewer.email);
  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid", fields: parsed.fields }, { status: 400 });
  }

  try {
    await submitServeApplication({ ...parsed.value, userId: viewer.id });
    return NextResponse.json(
      { status: "saved", backgroundCheckUrl: BACKGROUND_CHECK_URL },
      { status: 201 },
    );
  } catch (err) {
    if (!(err instanceof ServeSignupError)) {
      log({
        level: "error",
        msg: "serve_signup_failed",
        error: err instanceof Error ? err.message : "unknown",
      });
    }
    return NextResponse.json({ error: "serve_signup_failed" }, { status: 500 });
  }
}
