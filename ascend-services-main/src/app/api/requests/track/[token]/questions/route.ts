import { NextResponse } from "next/server";

import { log } from "@/lib/logger";
import { askAdmin } from "@/lib/requests/ask-admin";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = { "cache-control": "no-store" } as const;

/**
 * POST /api/requests/track/[token]/questions — the tracking link is the
 * credential. The body is `{ message }`. The token and the message stay out
 * of the log.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_body" },
      { status: 400, headers: PRIVATE_HEADERS },
    );
  }

  const message =
    typeof body === "object" && body !== null && "message" in body
      ? (body as { message?: unknown }).message
      : undefined;

  try {
    const result = await askAdmin(token, message);
    return toResponse(result);
  } catch (err) {
    log({
      level: "error",
      msg: "ask_admin_failed",
      error: err instanceof Error && err.message.trim() ? err.message.trim() : "unknown",
    });
    return NextResponse.json(
      { error: "ask_admin_failed" },
      { status: 500, headers: PRIVATE_HEADERS },
    );
  }
}

function toResponse(
  result: Awaited<ReturnType<typeof askAdmin>>,
): NextResponse {
  if (result.ok) {
    return NextResponse.json(
      { question: result.question },
      { status: 201, headers: PRIVATE_HEADERS },
    );
  }
  if (result.error === "not_found") {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: PRIVATE_HEADERS },
    );
  }
  if (result.error === "rate_limited") {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: PRIVATE_HEADERS },
    );
  }
  return NextResponse.json(
    { error: "invalid_input", field: result.field },
    { status: 400, headers: PRIVATE_HEADERS },
  );
}
