import { NextResponse } from "next/server";

import { log } from "@/lib/logger";
import { findRequestByTrackingToken } from "@/lib/requests/service";
import { isWellFormedTrackingToken } from "@/lib/requests/tracking-token";

export const dynamic = "force-dynamic";

/** Private payload: never cached by the browser or an intermediary. */
const PRIVATE_HEADERS = { "cache-control": "no-store" } as const;

/**
 * GET /api/requests/track/[token] — self-service portal feed for the holder of
 * a tracking token (Spec v6 §5). No session required; the token is the
 * credential, which is why it may echo the requester's own submission
 * including `street_address`.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!isWellFormedTrackingToken(token)) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: PRIVATE_HEADERS },
    );
  }

  let view;
  try {
    view = await findRequestByTrackingToken(token);
  } catch (err) {
    log({
      level: "error",
      msg: "tracking_lookup_failed",
      error: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json(
      { error: "tracking_lookup_failed" },
      { status: 500, headers: PRIVATE_HEADERS },
    );
  }

  if (!view) {
    log({ level: "warn", msg: "tracking_token_miss", action: "REQUEST_TRACKED" });
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: PRIVATE_HEADERS },
    );
  }

  return NextResponse.json({ request: view }, { headers: PRIVATE_HEADERS });
}
