import { NextResponse } from "next/server";

import { InvalidEmailError, requestMagicLink } from "@/lib/auth/magic-link";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/magic-link — `{ email, name? }`
 *
 * Always answers 202 for a well-formed address, whether or not the account
 * already exists, so the endpoint cannot be used to enumerate members.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { email, name } = body as { email?: unknown; name?: unknown };
  if (typeof email !== "string") {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  try {
    await requestMagicLink({
      email,
      name: typeof name === "string" ? name : undefined,
    });
  } catch (err) {
    if (err instanceof InvalidEmailError) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }
    log({
      level: "error",
      msg: "magic_link_request_failed",
      error: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "magic_link_failed" }, { status: 500 });
  }

  return NextResponse.json({ status: "sent" }, { status: 202 });
}
