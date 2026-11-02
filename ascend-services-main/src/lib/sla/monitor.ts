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
import { listAdminEmails } from "@/lib/auth/admins";

import {
  notifyAdminsOfSlaBreaches,
  slaNotificationsEnabled,
  type SlaNotificationOutcome,
} from "./notify";

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
  /** Mail and feature flags. Defaults to the process environment. */
  env?: NodeJS.ProcessEnv;
}

/**
 * The Spec v6 §6 SLA monitor. Evaluates every open request against the admin's
 * `SystemSettings` thresholds, emails every active admin, and records each
 * newly emailed breach in the audit trail with one `SLA_BREACH` log line.
 *
 * Alerting is deduplicated per request per stuck state, so a cron may run as
 * often as it likes: the same neglected request produces one alert, not one per
 * tick, and a request that stalls again in a later state alerts again.
 *
 * The audit row is written only after the admin email is accepted. A failed
 * send stays unrecorded so the next pass tries again instead of going quiet.
 */
export async function runSlaMonitor({
  now = new Date(),
  limit = SLA_SCAN_LIMIT,
  env = process.env,
}: SlaMonitorOptions = {}): Promise<SlaMonitorReport> {
  const { thresholds } = await readSlaSettings();

  const breaches: SlaBreach[] = [];
  for (const check of SLA_CHECKS) {
    const overdue = await findOverdue(check, thresholds, now, limit);
    breaches.push(...overdue.map((record) => toBreach(check, thresholds, record, now)));
  }

  const admins = slaNotificationsEnabled(env) ? await listAdminEmails() : [];
  const alreadyRaised = await previouslyRaised(breaches);
  const deliveries = pendingAlertDeliveries(breaches, admins, alreadyRaised);
  const alerted: SlaBreach[] = [];
  let notification: SlaNotificationOutcome;

  if (breaches.length === 0 || (admins.length > 0 && deliveries.length === 0)) {
    notification = "skipped_no_new_breaches";
  } else if (!slaNotificationsEnabled(env)) {
    notification = "skipped_disabled";
  } else if (admins.length === 0) {
    notification = "skipped_no_admins";
  } else {
    let sent = 0;
    for (const delivery of deliveries) {
      const outcome = await notifyAdminsOfSlaBreaches(delivery.breaches, env, [delivery.email]);
      if (outcome !== "sent") continue;
      sent += 1;
      alerted.push(...(await recordBreaches(delivery.breaches, delivery.email)));
    }
    notification = sent === 0 ? "failed" : "sent";
  }

  const alertedBreaches = breaches.filter((breach) =>
    alerted.some((row) => row.requestId === breach.requestId && row.status === breach.status),
  );

  log({
    msg: "sla_monitor_completed",
    ranAt: now.toISOString(),
    breached: breaches.length,
    alerted: alertedBreaches.length,
    suppressed: breaches.length - alertedBreaches.length,
    notification,
    ...thresholds,
  });

  return {
    ranAt: now.toISOString(),
    thresholds,
    breaches,
    alerted: alertedBreaches,
    suppressed: breaches.length - alertedBreaches.length,
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

export interface AlertDelivery {
  email: string;
  breaches: SlaBreach[];
}

/**
 * One digest per admin who has not yet been told about a breach. A legacy
 * audit row with no address counts as already sent to every admin.
 */
export function pendingAlertDeliveries(
  breaches: readonly SlaBreach[],
  admins: readonly string[],
  alreadyRaised: ReadonlySet<string>,
): AlertDelivery[] {
  const deliveries: AlertDelivery[] = [];
  for (const email of admins) {
    const pending = breaches.filter(
      (breach) =>
        !alreadyRaised.has(alertKey(breach.requestId, breach.status, "*")) &&
        !alreadyRaised.has(alertKey(breach.requestId, breach.status, email)),
    );
    if (pending.length > 0) deliveries.push({ email, breaches: pending });
  }
  return deliveries;
}

export function alertKey(requestId: string, status: string, email: string): string {
  return `${requestId}:${status}:${email}`;
}

/**
 * Records one row per breach for the admin whose email was accepted.
 * A failed send writes nothing, so the next pass tries that admin again.
 */
async function recordBreaches(breaches: SlaBreach[], email: string): Promise<SlaBreach[]> {
  for (const breach of breaches) {
    await prisma.auditLog.create({
      data: {
        requestId: breach.requestId,
        action: SLA_BREACH_ACTION,
        fromStatus: breach.status,
        metadata: {
          source: SLA_MONITOR_SOURCE,
          check: breach.check,
          threshold_key: breach.threshold_key,
          threshold: breach.threshold,
          unit: breach.unit,
          age_hours: breach.age_hours,
          overdue_hours: breach.overdue_hours,
          notified_email: email,
        },
      },
    });

    log({
      level: "warn",
      msg: "sla_breach",
      action: SLA_BREACH_ACTION,
      ...breach,
    });
  }

  return breaches;
}

/** `requestId` + stuck state + admin address pairs already emailed. */
async function previouslyRaised(breaches: SlaBreach[]): Promise<Set<string>> {
  if (breaches.length === 0) return new Set();

  const raised = await prisma.auditLog.findMany({
    where: {
      action: SLA_BREACH_ACTION,
      requestId: { in: breaches.map((breach) => breach.requestId) },
    },
    select: { requestId: true, fromStatus: true, metadata: true },
  });

  return new Set(
    raised.map((row: { requestId: string | null; fromStatus: string | null; metadata: unknown }) =>
      alertKey(row.requestId ?? "", row.fromStatus ?? "", notifiedEmail(row.metadata)),
    ),
  );
}

function notifiedEmail(metadata: unknown): string {
  if (typeof metadata !== "object" || metadata === null) return "*";
  const value = (metadata as { notified_email?: unknown }).notified_email;
  return typeof value === "string" && value.length > 0 ? value : "*";
}
