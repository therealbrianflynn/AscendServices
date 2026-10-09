import { NextResponse } from "next/server";

import { getServiceTypeOptions } from "@/lib/requests/service-types";
import { parseServeApplication } from "@/lib/serve/application";
import { BACKGROUND_CHECK_URL } from "@/lib/serve/background-check";
import { ServeSignupError, submitServeApplication } from "@/lib/serve/submit";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** POST /api/serve — save a serve application. Does not grant board access. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = parseServeApplication(body, getServiceTypeOptions());
  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid", fields: parsed.fields }, { status: 400 });
  }

  try {
    const result = await submitServeApplication(parsed.value);
    return NextResponse.json(
      {
        status: "saved",
        emailSent: result.emailSent,
        backgroundCheckUrl: BACKGROUND_CHECK_URL,
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ServeSignupError) {
      return NextResponse.json({ error: "serve_signup_failed" }, { status: 500 });
    }
    log({
      level: "error",
      msg: "serve_signup_failed",
      error: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "serve_signup_failed" }, { status: 500 });
  }
}
