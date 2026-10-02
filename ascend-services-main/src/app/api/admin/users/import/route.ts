import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth/guard";
import { ADMIN_ROLE } from "@/lib/auth/roles";
import { log } from "@/lib/logger";
import { VOLUNTEER_IMPORT_FILE_FIELD } from "@/lib/volunteers/import/contract";
import { importVolunteers } from "@/lib/volunteers/import/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/users/import — bulk volunteer upsert (Spec v6 §4).
 *
 * ADMIN only, `multipart/form-data`, one `.csv` or `.xlsx` sheet. A sheet we
 * cannot read at all is a 400; a sheet we can read always returns 200 with the
 * per-row report, because "three rows landed and two named rows did not" is an
 * outcome the admin has to see, not an error to swallow.
 *
 * The report names members, so it is `no-store` like every other admin feed,
 * and nothing from it reaches the structured log.
 */
export async function POST(request: Request) {
  const guarded = await requireRole(ADMIN_ROLE);
  if (!guarded.ok) return guarded.response;

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get(VOLUNTEER_IMPORT_FILE_FIELD);
    file = value instanceof File ? value : null;
  } catch {
    return NextResponse.json({ error: "invalid_upload" }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }

  try {
    const outcome = await importVolunteers({
      filename: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
      actorId: guarded.session.sub,
    });

    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error }, { status: 400 });
    }

    return NextResponse.json(outcome.report, {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    log({
      level: "error",
      msg: "volunteer_import_failed",
      actorId: guarded.session.sub,
      error: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "volunteer_import_failed" }, { status: 500 });
  }
}
