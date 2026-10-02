import { log } from "@/lib/logger";

import { EmailDeliveryError } from "./errors";
import type { EmailMessage, EmailTransport, SentEmail } from "./transport";

export const SES_TRANSPORT_NAME = "ses";

/** Fields the SES adapter needs. The body stays out of logs. */
export interface SesSendRequest {
  from: string;
  to: string;
  bcc?: string[];
  subject: string;
  text: string;
}

/** Sends one message and returns the provider message id. */
export interface SesMailer {
  send(request: SesSendRequest): Promise<string>;
}

export interface SesTransportOptions {
  from: string;
  mailer: SesMailer;
}

/**
 * Delivers mail through Amazon SES. Callers keep using `EmailTransport`;
 * the AWS client lives behind `SesMailer` so this module stays testable.
 */
export function createSesEmailTransport(options: SesTransportOptions): EmailTransport {
  const from = requireText(options.from, "EMAIL_FROM");
  return {
    async send(message: EmailMessage): Promise<SentEmail> {
      const request = toSendRequest(from, message);
      let messageId: string;
      try {
        messageId = (await options.mailer.send(request)).trim();
      } catch (err) {
        if (err instanceof EmailDeliveryError) {
          throw err;
        }
        throw new EmailDeliveryError(describeSendFailure(err));
      }
      if (!messageId) {
        throw new EmailDeliveryError("SES send failed: response did not include a message id");
      }
      log({
        msg: "email_sent",
        transport: SES_TRANSPORT_NAME,
        template: message.template,
        to: request.to,
        subject: request.subject,
        from,
        messageId,
      });
      return { transport: SES_TRANSPORT_NAME, messageId };
    },
  };
}

function toSendRequest(from: string, message: EmailMessage): SesSendRequest {
  const request: SesSendRequest = {
    from,
    to: requireText(message.to, "to"),
    subject: requireText(message.subject, "subject"),
    text: requireText(message.text, "text"),
  };
  const bcc = cleanBcc(message.bcc);
  if (bcc.length > 0) {
    request.bcc = bcc;
  }
  return request;
}

function cleanBcc(bcc: string[] | undefined): string[] {
  if (!bcc) {
    return [];
  }
  return bcc.map((address) => address.trim()).filter((address) => address.length > 0);
}

function requireText(value: string | undefined, field: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    throw new EmailDeliveryError(`${field} is required to send mail`);
  }
  return trimmed;
}

function describeSendFailure(err: unknown): string {
  const detail = err instanceof Error && err.message.trim() ? err.message.trim() : "unknown";
  return `SES send failed: ${detail}`;
}
