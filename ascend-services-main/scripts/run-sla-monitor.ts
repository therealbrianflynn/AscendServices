/**
 * Runs one Spec v6 §6 SLA pass and exits — the cron entry point.
 *
 *   pnpm sla:check
 *
 * As a quarter-hourly cron entry:
 *
 *   0,15,30,45 * * * * cd /app && pnpm sla:check >> /var/log/ascend-sla.log 2>&1
 *
 * Safe to run as often as you like: each breach is alerted once per request per
 * stuck state (see `src/lib/sla/monitor.ts`). Exits non-zero when the pass
 * itself fails, so a scheduler can alarm on it.
 */
import { log } from "../src/lib/logger";
import { prisma } from "../src/lib/prisma";
import { runSlaMonitor } from "../src/lib/sla/monitor";

async function main(): Promise<void> {
  const report = await runSlaMonitor();

  log({
    msg: "sla_monitor_run",
    ranAt: report.ranAt,
    breached: report.breaches.length,
    alerted: report.alerted.length,
    suppressed: report.suppressed,
    notification: report.notification,
  });
}

main()
  .catch((err: unknown) => {
    log({
      level: "error",
      msg: "sla_monitor_failed",
      error: err instanceof Error ? err.message : "unknown",
    });
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
