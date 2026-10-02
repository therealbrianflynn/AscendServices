import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth/guard";
import { ADMIN_ROLE } from "@/lib/auth/roles";
import { log } from "@/lib/logger";
import { runSlaMonitor } from "@/lib/sla/monitor";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/sla/monitor — run the Spec v6 §6 SLA pass on demand.
 *
 * Same job the cron runs (`pnpm sla:check`), exposed so an admin can check the
 * pipeline without shell access. POST because the pass writes: it audits every
 * new breach and mails the digest. The report carries no requester PII.
 */
export async function POST() {
  const guarded = await requireRole(ADMIN_ROLE);
  if (!guarded.ok) return guarded.response;

  try {
    const report = await runSlaMonitor();
    return NextResponse.json(report, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    log({
      level: "error",
      msg: "sla_monitor_failed",
      actorId: guarded.session.sub,
      error: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "sla_monitor_failed" }, { status: 500 });
  }
}
