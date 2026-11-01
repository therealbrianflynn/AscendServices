import { listAdminEmails } from "@/lib/auth/admins";
import { getEmailTransport } from "@/lib/email";
import { log } from "@/lib/logger";

import type { SlaBreach } from "./checks";

export const SLA_ALERT_EMAIL_TEMPLATE = "sla_breach_digest";

/** Env switch: a ministry running the job hourly may want the log lines only. */
const NOTIFY_ENV_KEY = "SLA_ADMIN_NOTIFY";

/**
 * Why the admins were or were not emailed. A failure is reported rather than
 * thrown. The monitor records a breach only after `sent`, so a failed send
 * is tried again on the next pass.
 */
export type SlaNotificationOutcome =
  | "sent"
  | "skipped_no_new_breaches"
  | "skipped_no_admins"
  | "skipped_disabled"
  | "failed";

/**
 * Emails every active admin when requests pass the thresholds in the console.
 * Each admin is a direct recipient, so a failure for one address does not drop
 * the others.
 *
 * The digest carries request ids and thresholds only — under
 * `EMAIL_TRANSPORT=log` the body is written straight to the log, so it is held
 * to the same no-PII rule as the `SLA_BREACH` lines themselves.
 */
export async function notifyAdminsOfSlaBreaches(
  breaches: SlaBreach[],
  env: NodeJS.ProcessEnv = process.env,
  recipients: readonly string[] = [],
): Promise<SlaNotificationOutcome> {
  if (breaches.length === 0) return "skipped_no_new_breaches";
  if (!slaNotificationsEnabled(env)) return "skipped_disabled";

  const addressed = recipients.length > 0 ? [...recipients] : await listAdminEmails();
  if (addressed.length === 0) {
    log({
      level: "warn",
      msg: "sla_alert_skipped",
      template: SLA_ALERT_EMAIL_TEMPLATE,
      reason: "no_admins",
      breaches: breaches.length,
    });
    return "skipped_no_admins";
  }

  let transport;
  try {
    transport = getEmailTransport(env);
  } catch (err) {
    log({
      level: "error",
      msg: "sla_alert_failed",
      template: SLA_ALERT_EMAIL_TEMPLATE,
      breaches: breaches.length,
      error: errorMessage(err),
    });
    return "failed";
  }

  const subject = slaAlertSubject(breaches);
  const text = renderSlaAlertEmail(breaches);
  let delivered = 0;

  for (const to of addressed) {
    try {
      const sent = await transport.send({
        to,
        subject,
        template: SLA_ALERT_EMAIL_TEMPLATE,
        text,
      });
      delivered += 1;
      log({
        msg: "sla_alert_sent",
        template: SLA_ALERT_EMAIL_TEMPLATE,
        transport: sent.transport,
        messageId: sent.messageId,
        to,
        breaches: breaches.length,
      });
    } catch (err) {
      log({
        level: "error",
        msg: "sla_alert_failed",
        template: SLA_ALERT_EMAIL_TEMPLATE,
        to,
        breaches: breaches.length,
        error: errorMessage(err),
      });
    }
  }

  if (delivered !== addressed.length) return "failed";
  return "sent";
}

export function slaAlertSubject(breaches: readonly { check: string }[]): string {
  const count = breaches.length;
  if (count > 0 && breaches.every((breach) => breach.check === "unassigned")) {
    return count === 1
      ? "A help request is still unassigned"
      : `${count} help requests are still unassigned`;
  }
  return count === 1 ? "1 request is past its SLA" : `${count} requests are past their SLA`;
}

export function renderSlaAlertEmail(breaches: SlaBreach[]): string {
  return [
    "These requests have passed the alert times set in the admin console:",
    "",
    ...breaches.map(renderBreachLine),
    "",
    "Open the admin console to follow up. Requester details are not included",
    "here on purpose — they live behind the console.",
    "",
    "— Ascend Services",
  ].join("\n");
}

function renderBreachLine(breach: SlaBreach): string {
  if (breach.check === "unassigned") {
    return (
      `- Help request ${breach.requestId} (${breach.service_type}, ${breach.neighborhood})` +
      ` has not been assigned. It has waited ${breach.age_hours}h;` +
      ` the alert is ${breach.threshold} ${breach.unit}.`
    );
  }
  return (
    `- ${breach.check}: request ${breach.requestId} (${breach.service_type}, ${breach.neighborhood})` +
    ` — ${breach.age_hours}h in ${breach.status}, ${breach.overdue_hours}h past the` +
    ` ${breach.threshold} ${breach.unit} limit`
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message.trim() ? err.message.trim() : "unknown";
}

/** Opt-out, not opt-in: an unconfigured install still tells someone. */
export function slaNotificationsEnabled(env: NodeJS.ProcessEnv): boolean {
  return env[NOTIFY_ENV_KEY]?.trim().toLowerCase() !== "false";
}
