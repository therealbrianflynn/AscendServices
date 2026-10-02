import { log } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { parseRequestStatus } from "@/lib/requests/status";
import { SLA_REQUEST_SELECT, type SlaRequestRecord } from "@/lib/requests/views";
import { readSlaSettings } from "@/lib/settings/sla-settings";
import { slaThreshold, type SlaSettings } from "@/lib/settings/sla-thresholds";

import {
  SLA_CHECKS,
  cutoffFor,
  hoursBetween,
  thresholdHours,
  type SlaBreach,
  type SlaCheck,
} from "./checks";
import { notifyAdminsOfSlaBreaches, type SlaNotificationOutcome } from "./notify";

export const SLA_BREACH_ACTION = "SLA_BREACH";

/** Audit metadata marker: this breach came from the monitor job, not a person. */
const SLA_MONITOR_SOURCE = "sla_monitor";

/**
 * Rows examined per check in one pass. A ministry that is this far behind has a
 * staffing problem, not a paging problem, and the job must stay bounded.
 */
export const SLA_SCAN_LIMIT = 200;

export interface SlaMonitorReport {
  ranAt: string;
  thresholds: SlaSettings;
  /** Overdue requests found this pass, including ones already alerted on. */
  breaches: SlaBreach[];
  /** The subset alerted on for the first time (logged, audited, emailed). */
  alerted: SlaBreach[];
  /** Overdue rows suppressed because an earlier pass already alerted. */
  suppressed: number;
  notification: SlaNotificationOutcome;
}

export interface SlaMonitorOptions {
  /** Injectable clock: the job is a cron, and a cron has to be testable. */
  now?: Date;
  limit?: number;
}

/**
 * The Spec v6 §6 SLA monitor. Evaluates every open request against the admin's
 * `SystemSettings` thresholds, records each new breach in the audit trail,
 * writes one `SLA_BREACH` line to the structured log and hands the digest to
 * the admin notifier.
 *
 * Alerting is deduplicated per request per stuck state, so a cron may run as
 * often as it likes: the same neglected request produces one alert, not one per
 * tick, and a request that stalls again in a later state alerts again.
 */
export async function runSlaMonitor({
  now = new Date(),
  limit = SLA_SCAN_LIMIT,
}: SlaMonitorOptions = {}): Promise<SlaMonitorReport> {
  const { thresholds } = await readSlaSettings();

  const breaches: SlaBreach[] = [];
  for (const check of SLA_CHECKS) {
    const overdue = await findOverdue(check, thresholds, now, limit);
    breaches.push(...overdue.map((record) => toBreach(check, thresholds, record, now)));
  }

  const alerted = await raiseNewBreaches(breaches);
  const notification = await notifyAdminsOfSlaBreaches(alerted);

  log({
    msg: "sla_monitor_completed",
    ranAt: now.toISOString(),
    breached: breaches.length,
    alerted: alerted.length,
    suppressed: breaches.length - alerted.length,
    notification,
    ...thresholds,
  });

  return {
    ranAt: now.toISOString(),
    thresholds,
    breaches,
    alerted,
    suppressed: breaches.length - alerted.length,
    notification,
  };
}

async function findOverdue(
  check: SlaCheck,
  thresholds: SlaSettings,
  now: Date,
  limit: number,
): Promise<SlaRequestRecord[]> {
  const records = await prisma.request.findMany({
    where: {
      status: check.status,
      // A null clock (e.g. ASSIGNED with no `assignedAt`) cannot be aged, and
      // Prisma excludes it from the comparison rather than guessing.
      [check.clock]: { lt: cutoffFor(check, thresholds, now) },
    },
    select: SLA_REQUEST_SELECT,
    orderBy: { [check.clock]: "asc" },
    take: limit,
  });

  return records as SlaRequestRecord[];
}

function toBreach(
  check: SlaCheck,
  thresholds: SlaSettings,
  record: SlaRequestRecord,
  now: Date,
): SlaBreach {
  const since = record[check.clock] ?? record.createdAt;
  const age = hoursBetween(since, now);

  return {
    requestId: record.id,
    check: check.key,
    status: parseRequestStatus(record.status),
    threshold_key: check.thresholdKey,
    threshold: thresholds[check.thresholdKey],
    unit: slaThreshold(check.thresholdKey).unit,
    age_hours: age,
    overdue_hours: Math.round((age - thresholdHours(check, thresholds)) * 10) / 10,
    service_type: record.service_type,
    neighborhood: record.neighborhood,
    since: since.toISOString(),
  };
}

/**
 * Audits and logs the breaches nobody has been told about yet.
 *
 * The audit row is written before the log line so a crash mid-pass can only
 * cost an alert once, never repeat one: the next run sees the recorded breach
 * and stays quiet.
 */
async function raiseNewBreaches(breaches: SlaBreach[]): Promise<SlaBreach[]> {
  if (breaches.length === 0) return [];

  const alreadyRaised = await previouslyRaised(breaches);
  const alerted: SlaBreach[] = [];

  for (const breach of breaches) {
    if (alreadyRaised.has(breachKey(breach.requestId, breach.status))) continue;

    await prisma.auditLog.create({
      data: {
        requestId: breach.requestId,
        action: SLA_BREACH_ACTION,
        // The state it is stuck in, which is also the dedupe key.
        fromStatus: breach.status,
        metadata: {
          source: SLA_MONITOR_SOURCE,
          check: breach.check,
          threshold_key: breach.threshold_key,
          threshold: breach.threshold,
          unit: breach.unit,
          age_hours: breach.age_hours,
          overdue_hours: breach.overdue_hours,
        },
      },
    });

    log({
      level: "warn",
      msg: "sla_breach",
      action: SLA_BREACH_ACTION,
      ...breach,
    });

    alerted.push(breach);
  }

  return alerted;
}

/** `requestId` + stuck state pairs the audit trail has already alerted on. */
async function previouslyRaised(breaches: SlaBreach[]): Promise<Set<string>> {
  const raised = await prisma.auditLog.findMany({
    where: {
      action: SLA_BREACH_ACTION,
      requestId: { in: breaches.map((breach) => breach.requestId) },
    },
    select: { requestId: true, fromStatus: true },
  });

  return new Set(
    raised.map((row: { requestId: string | null; fromStatus: string | null }) =>
      breachKey(row.requestId, row.fromStatus),
    ),
  );
}

function breachKey(requestId: string | null, status: string | null): string {
  return `${requestId}:${status}`;
}
