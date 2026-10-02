import { randomUUID } from "node:crypto";

import { log } from "@/lib/logger";

import type { EmailMessage, EmailTransport, SentEmail } from "./transport";

export const LOG_TRANSPORT_NAME = "log";

export interface LogEmailTransportOptions {
  from: string;
  /**
   * Whether to log the rendered body. Bodies contain magic-link tokens, so this
   * is for local development only and is off in production.
   */
  includeBody: boolean;
}

/**
 * Writes outbound mail to the structured JSON log instead of sending it. Keeps
 * the seed MVP free of paid SMTP while leaving one auditable line per message.
 */
export function createLogEmailTransport({
  from,
  includeBody,
}: LogEmailTransportOptions): EmailTransport {
  return {
    async send(message: EmailMessage): Promise<SentEmail> {
      const messageId = `${LOG_TRANSPORT_NAME}-${randomUUID()}`;
      log({
        msg: "email_sent",
        transport: LOG_TRANSPORT_NAME,
        template: message.template,
        from,
        to: message.to,
        ...(message.bcc?.length ? { bcc: message.bcc } : {}),
        subject: message.subject,
        messageId,
        ...(includeBody ? { body: message.text } : {}),
      });
      return { transport: LOG_TRANSPORT_NAME, messageId };
    },
  };
}
