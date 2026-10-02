import { getAppBaseUrl } from "@/lib/app-url";
import { getEmailTransport } from "@/lib/email";
import { log } from "@/lib/logger";

export const VOLUNTEER_WELCOME_TEMPLATE = "volunteer_welcome";

/**
 * Welcome stub for a volunteer an admin imported (Spec v6 §4). It goes through
 * the same `EmailTransport` as every other message, so under
 * `EMAIL_TRANSPORT=log` it is one `email_sent` JSON line and nothing is sent.
 *
 * The body points at `/signin`, the passwordless entry point that exists today:
 * enter the imported address and the magic-link flow mails a one-time link. The
 * `onboarding_token` minted alongside this email marks the account as
 * import-provisioned for the Spec v6 §5 first-time onboarding flow; it is a
 * bearer credential, so it is never put in the body, the log or the report.
 */
export type VolunteerWelcomeOutcome = "sent" | "failed";

export interface VolunteerWelcomeRecipient {
  name: string;
  email: string;
}

export function volunteerWelcomeSubject(): string {
  return "Welcome to Ascend Services";
}

export function volunteerSignInUrl(env: NodeJS.ProcessEnv = process.env): string {
  return new URL("/signin", getAppBaseUrl(env)).toString();
}

export function renderVolunteerWelcomeEmail({
  name,
  signInUrl,
}: {
  name: string;
  signInUrl: string;
}): string {
  return [
    `Hi ${name},`,
    "",
    "An Ascend Services admin has set up a volunteer account for you, so you can",
    "start picking up requests from the Help Wanted board.",
    "",
    "Finish setting up here:",
    "",
    signInUrl,
    "",
    "Enter this email address and we will send you a one-time sign-in link. Once",
    "you are in you can add a passkey and fill in your profile.",
    "",
    "If you were not expecting this, you can ignore the message — the account",
    "stays unused until someone signs in.",
    "",
    "— Ascend Services",
  ].join("\n");
}

/**
 * Reports its outcome rather than throwing: the account is already created and
 * audited by the time this runs, and an unsendable welcome must not undo that
 * or stop the rest of the import.
 */
export async function sendVolunteerWelcome(
  recipient: VolunteerWelcomeRecipient,
  env: NodeJS.ProcessEnv = process.env,
): Promise<VolunteerWelcomeOutcome> {
  try {
    const sent = await getEmailTransport(env).send({
      to: recipient.email,
      subject: volunteerWelcomeSubject(),
      template: VOLUNTEER_WELCOME_TEMPLATE,
      text: renderVolunteerWelcomeEmail({
        name: recipient.name,
        signInUrl: volunteerSignInUrl(env),
      }),
    });

    log({
      msg: "volunteer_welcome_sent",
      template: VOLUNTEER_WELCOME_TEMPLATE,
      transport: sent.transport,
      messageId: sent.messageId,
    });

    return "sent";
  } catch (err) {
    log({
      level: "error",
      msg: "volunteer_welcome_failed",
      template: VOLUNTEER_WELCOME_TEMPLATE,
      error: err instanceof Error ? err.message : "unknown",
    });
    return "failed";
  }
}
