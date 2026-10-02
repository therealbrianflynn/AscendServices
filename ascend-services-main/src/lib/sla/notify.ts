import { listAdminEmails } from "@/lib/auth/admins";
import { getEmailTransport } from "@/lib/email";
import { log } from "@/lib/logger";

import type { SlaBreach } from "./checks";

export const SLA_ALERT_EMAIL_TEMPLATE = "sla_breach_digest";

/** Env switch: a ministry running the job hourly may want the log lines only. */
const NOTIFY_ENV_KEY = "SLA_ADMIN_NOTIFY";

/**
 * Why the admins were or were not paged. Every outcome is reported rather than
 * thrown: the breaches are already audited and logged, and a mail failure must
 * not lose that work or stop the rest of the pass.
 */
export type SlaNotificationOutcome =
  | "sent"
  | "skipped_no_new_breaches"
  | "skipped_no_admins"
  | "skipped_disabled"
  | "failed";

/**
 * Admin notify stub for the Spec v6 §6 monitor. Sends one digest per pass
 * through the configured `EmailTransport` (the seed MVP's structured-log stub),
 * addressed to the first admin with the rest BCC'd.
 *
 * The digest carries request ids and thresholds only — under
 * `EMAIL_TRANSPORT=log` the body is written straight to the log, so it is held
 * to the same no-PII rule as the `SLA_BREACH` lines themselves.
 */
export async function notifyAdminsOfSlaBreaches(
  breaches: SlaBreach[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<SlaNotificationOutcome> {
  if (breaches.length === 0) return "skipped_no_new_breaches";
  if (!notificationsEnabled(env)) return "skipped_disabled";

  const [recipient, ...others] = await listAdminEmails();
  if (!recipient) {
    log({
      level: "warn",
      msg: "sla_alert_skipped",
      template: SLA_ALERT_EMAIL_TEMPLATE,
      reason: "no_admins",
      breaches: breaches.length,
    });
    return "skipped_no_admins";
  }

  try {
    const sent = await getEmailTransport(env).send({
      to: recipient,
      bcc: others,
      subject: slaAlertSubject(breaches.length),
      template: SLA_ALERT_EMAIL_TEMPLATE,
      text: renderSlaAlertEmail(breaches),
    });

    log({
      msg: "sla_alert_sent",
      template: SLA_ALERT_EMAIL_TEMPLATE,
      transport: sent.transport,
      messageId: sent.messageId,
      breaches: breaches.length,
    });

    return "sent";
  } catch (err) {
    log({
      level: "error",
      msg: "sla_alert_failed",
      template: SLA_ALERT_EMAIL_TEMPLATE,
      breaches: breaches.length,
      error: err instanceof Error ? err.message : "unknown",
    });
    return "failed";
  }
}

export function slaAlertSubject(count: number): string {
  return count === 1
    ? "1 request is past its SLA"
    : `${count} requests are past their SLA`;
}

export function renderSlaAlertEmail(breaches: SlaBreach[]): string {
  return [
    "These requests are past the SLA thresholds you set in the admin console:",
    "",
    ...breaches.map(
      (breach) =>
        `- ${breach.check}: request ${breach.requestId} (${breach.service_type}, ${breach.neighborhood})` +
        ` — ${breach.age_hours}h in ${breach.status}, ${breach.overdue_hours}h past the` +
        ` ${breach.threshold} ${breach.unit} limit`,
    ),
    "",
    "Open the admin console to reassign or follow up. Requester details are not",
    "included here on purpose — they live behind the console.",
    "",
    "— Ascend Services",
  ].join("\n");
}

/** Opt-out, not opt-in: an unconfigured install still tells someone. */
function notificationsEnabled(env: NodeJS.ProcessEnv): boolean {
  return env[NOTIFY_ENV_KEY]?.trim().toLowerCase() !== "false";
}
