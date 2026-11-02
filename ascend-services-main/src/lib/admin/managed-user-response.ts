import { NextResponse } from "next/server";

import { log } from "@/lib/logger";

import { ManagedUserError } from "./managed-user";

/** Maps a managed-user failure onto an HTTP response. Unexpected errors stay generic. */
export function managedUserErrorResponse(err: unknown, actorId: string): NextResponse {
  if (err instanceof ManagedUserError) {
    const status = err.code === "invalid" ? 400 : err.code === "not_found" ? 404 : 409;
    return NextResponse.json({ error: err.code }, { status });
  }

  log({
    level: "error",
    msg: "managed_user_failed",
    actorId,
    error: err instanceof Error ? err.message : "unknown",
  });
  return NextResponse.json({ error: "user_save_failed" }, { status: 500 });
}
