import { listAdminEmails } from "@/lib/auth/admins";
import { getEmailTransport } from "@/lib/email";
import { log } from "@/lib/logger";

export const ASK_ADMIN_EMAIL_TEMPLATE = "ask_admin";

export type AskAdminNotification = "sent" | "partial" | "skipped_no_admins" | "failed";

/** Facts the email is allowed to carry. Contact details stay in the console. */
export interface AskAdminEmailFacts {
  requestId: string;
  requesterName: string;
  serviceType: string;
  neighborhood: string;
  message: string;
}

/**
 * Emails every active admin. One rejected address does not drop the others.
 * A failure is reported rather than thrown: the question is already saved.
 */
export async function notifyAdminsOfQuestion(
  facts: AskAdminEmailFacts,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AskAdminNotification> {
  const addressed = await listAdminEmails();
  if (addressed.length === 0) {
    log({
      level: "warn",
      msg: "ask_admin_skipped",
      template: ASK_ADMIN_EMAIL_TEMPLATE,
      requestId: facts.requestId,
      reason: "no_admins",
    });
    return "skipped_no_admins";
  }

  let transport;
  try {
    transport = getEmailTransport(env);
  } catch (err) {
    log({
      level: "error",
      msg: "ask_admin_failed",
      template: ASK_ADMIN_EMAIL_TEMPLATE,
      requestId: facts.requestId,
      error: errorMessage(err),
    });
    return "failed";
  }

  const subject = askAdminSubject();
  const text = renderAskAdminEmail(facts);
  let delivered = 0;

  for (const to of addressed) {
    try {
      const sent = await transport.send({
        to,
        subject,
        template: ASK_ADMIN_EMAIL_TEMPLATE,
        text,
      });
      delivered += 1;
      log({
        msg: "ask_admin_sent",
        template: ASK_ADMIN_EMAIL_TEMPLATE,
        transport: sent.transport,
        messageId: sent.messageId,
        requestId: facts.requestId,
        to,
      });
    } catch (err) {
      log({
        level: "error",
        msg: "ask_admin_failed",
        template: ASK_ADMIN_EMAIL_TEMPLATE,
        requestId: facts.requestId,
        to,
        error: errorMessage(err),
      });
    }
  }

  if (delivered === 0) return "failed";
  if (delivered !== addressed.length) return "partial";
  return "sent";
}

export function askAdminSubject(): string {
  return "A requester asked for help with their request";
}

export function renderAskAdminEmail(facts: AskAdminEmailFacts): string {
  return [
    `${facts.requesterName} asked for help with their ${facts.serviceType} request in ${facts.neighborhood}.`,
    "",
    `Request ${facts.requestId}`,
    "",
    facts.message,
    "",
    "Open the admin console to see their contact details and follow up.",
    "This note does not include their street address or phone number.",
    "",
    "— Ascend Services",
  ].join("\n");
}

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message.trim() ? err.message.trim() : "unknown";
}
