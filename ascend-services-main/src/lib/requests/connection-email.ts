import { listAdminEmails } from "@/lib/auth/admins";
import { getEmailTransport, type SentEmail } from "@/lib/email";

export const CONNECTION_EMAIL_TEMPLATE = "volunteer_connection";

/**
 * Stand-in bio so a requester is never introduced to a blank profile. Members
 * fill theirs in during onboarding (Spec v6 §5).
 */
const MISSING_BIO_COPY =
  "They have not filled in a bio yet — they will introduce themselves when they reach out.";

export interface ConnectionEmailRequester {
  name: string;
  email: string;
}

export interface ConnectionEmailVolunteer {
  name: string;
  bio: string | null;
}

export interface ConnectionEmailInput {
  requester: ConnectionEmailRequester;
  volunteer: ConnectionEmailVolunteer;
  service_type: string;
}

/**
 * The Spec v6 §4 connection email: introduces the volunteer to the requester
 * by name and bio, BCC'ing admins for oversight.
 *
 * The body carries no street address and no tracking token. Under
 * `EMAIL_TRANSPORT=log` the rendered text is written to the structured log
 * outside production, so anything in here is effectively logged.
 */
export async function sendConnectionEmail({
  requester,
  volunteer,
  service_type,
}: ConnectionEmailInput): Promise<SentEmail> {
  return getEmailTransport().send({
    to: requester.email,
    bcc: await listAdminEmails(),
    subject: `${volunteer.name} is ready to help with your request`,
    template: CONNECTION_EMAIL_TEMPLATE,
    text: renderConnectionEmail({ requester, volunteer, service_type }),
  });
}

export function renderConnectionEmail({
  requester,
  volunteer,
  service_type,
}: ConnectionEmailInput): string {
  return [
    `Hi ${requester.name},`,
    "",
    `Good news — ${volunteer.name} has offered to help with your ${service_type} request.`,
    "",
    `About ${volunteer.name}:`,
    volunteer.bio?.trim() || MISSING_BIO_COPY,
    "",
    "They have the details they need and will contact you soon to arrange a time.",
    "",
    "If anything changes, reply to this message and our team will step in.",
    "",
    "— Ascend Services",
  ].join("\n");
}
