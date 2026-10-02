import { SESv2Client, SendEmailCommand, type SendEmailCommandOutput } from "@aws-sdk/client-sesv2";

import { EmailDeliveryError } from "./errors";
import type { SesMailer, SesSendRequest } from "./ses-transport";

const CHARSET = "UTF-8";

/** Narrow view of the SDK client so tests can substitute a fake. */
export interface SesCommandClient {
  send(command: SendEmailCommand): Promise<SendEmailCommandOutput>;
}

export function createSesClient(region: string): SESv2Client {
  const trimmed = region.trim();
  if (!trimmed) {
    throw new EmailDeliveryError("AWS_REGION is required when EMAIL_TRANSPORT=ses");
  }
  return new SESv2Client({ region: trimmed });
}

export function createSesMailer(client: SesCommandClient): SesMailer {
  return {
    async send(request: SesSendRequest): Promise<string> {
      let response: SendEmailCommandOutput;
      try {
        response = await client.send(new SendEmailCommand(toCommandInput(request)));
      } catch (err) {
        if (err instanceof EmailDeliveryError) {
          throw err;
        }
        const detail = err instanceof Error && err.message.trim() ? err.message.trim() : "unknown";
        throw new EmailDeliveryError(`SES send failed: ${detail}`);
      }
      const messageId = response.MessageId?.trim() ?? "";
      if (!messageId) {
        throw new EmailDeliveryError("SES send failed: response did not include a message id");
      }
      return messageId;
    },
  };
}

function toCommandInput(request: SesSendRequest) {
  return {
    FromEmailAddress: request.from,
    Destination: {
      ToAddresses: [request.to],
      ...(request.bcc && request.bcc.length > 0 ? { BccAddresses: request.bcc } : {}),
    },
    Content: {
      Simple: {
        Subject: { Data: request.subject, Charset: CHARSET },
        Body: { Text: { Data: request.text, Charset: CHARSET } },
      },
    },
  };
}
