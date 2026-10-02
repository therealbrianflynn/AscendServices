import { NextResponse } from "next/server";

import { getAppBaseUrl } from "@/lib/app-url";
import { log } from "@/lib/logger";
import { InvalidRequestInputError, parseHelpRequestInput } from "@/lib/requests/input";
import { createHelpRequest, listPublicRequests } from "@/lib/requests/service";
import { buildTrackingPath, buildTrackingUrl } from "@/lib/requests/tracking-token";

export const dynamic = "force-dynamic";

/**
 * POST /api/requests — public Request Help submission. No authentication: the
 * response hands back the tracking token that becomes the requester's only
 * credential for the self-service portal.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  let input;
  try {
    input = parseHelpRequestInput(body);
  } catch (err) {
    if (err instanceof InvalidRequestInputError) {
      return NextResponse.json(
        { error: "invalid_input", fields: err.fieldErrors },
        { status: 400 },
      );
    }
    throw err;
  }

  try {
    const created = await createHelpRequest(input);
    return NextResponse.json(
      {
        id: created.id,
        status: created.status,
        tracking_token: created.tracking_token,
        tracking_path: buildTrackingPath(created.tracking_token),
        tracking_url: buildTrackingUrl(created.tracking_token, getAppBaseUrl()),
      },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    log({
      level: "error",
      msg: "help_request_create_failed",
      error: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "request_create_failed" }, { status: 500 });
  }
}

/**
 * GET /api/requests — public board feed of NEW requests. Deliberately omits
 * `requester_name` and `street_address`; see `PUBLIC_REQUEST_SELECT`.
 */
export async function GET() {
  try {
    return NextResponse.json({ requests: await listPublicRequests() });
  } catch (err) {
    log({
      level: "error",
      msg: "public_request_list_failed",
      error: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "request_list_failed" }, { status: 500 });
  }
}
