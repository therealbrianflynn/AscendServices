import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth/guard";
import { ADMIN_ROLE } from "@/lib/auth/roles";
import { readJsonObject } from "@/lib/http/json-body";
import { log } from "@/lib/logger";
import { parseSlaSettingsPatch } from "@/lib/settings/sla-input";
import { readSlaSettings, saveSlaSettings } from "@/lib/settings/sla-settings";

export const dynamic = "force-dynamic";

/** GET /api/admin/settings/sla — current Spec v6 §6 SLA thresholds. */
export async function GET() {
  const guarded = await requireRole(ADMIN_ROLE);
  if (!guarded.ok) return guarded.response;

  try {
    return NextResponse.json({ settings: await readSlaSettings() });
  } catch (err) {
    log({
      level: "error",
      msg: "sla_settings_read_failed",
      actorId: guarded.session.sub,
      error: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "sla_settings_read_failed" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/settings/sla — edit one or more thresholds. Partial by
 * design: an admin tuning the unassigned alert must not have to restate the
 * other two and risk clobbering a colleague's change.
 */
export async function PATCH(request: Request) {
  const guarded = await requireRole(ADMIN_ROLE);
  if (!guarded.ok) return guarded.response;

  const parsed = parseSlaSettingsPatch(await readJsonObject(request));
  if (!parsed.ok) {
    return NextResponse.json(
      parsed.error === "invalid_thresholds"
        ? { error: parsed.error, fields: parsed.fields }
        : { error: parsed.error },
      { status: 400 },
    );
  }

  try {
    const settings = await saveSlaSettings({
      patch: parsed.patch,
      actorId: guarded.session.sub,
    });
    return NextResponse.json({ settings });
  } catch (err) {
    log({
      level: "error",
      msg: "sla_settings_update_failed",
      actorId: guarded.session.sub,
      error: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "sla_settings_update_failed" }, { status: 500 });
  }
}
