import { createLogEmailTransport, LOG_TRANSPORT_NAME } from "./log-transport";
import { createSesClient, createSesMailer } from "./ses-client";
import { createSesEmailTransport, SES_TRANSPORT_NAME } from "./ses-transport";
import { EmailDeliveryError } from "./errors";
import type { EmailTransport } from "./transport";

export type { EmailMessage, EmailTransport, SentEmail } from "./transport";
export { EmailDeliveryError } from "./errors";

const DEFAULT_FROM = "no-reply@ascend.local";

/**
 * Resolves the transport named by `EMAIL_TRANSPORT`.
 * `log` writes structured JSON (local and troubleshooting).
 * `ses` delivers through Amazon SES using the default AWS credential chain.
 */
export function getEmailTransport(env: NodeJS.ProcessEnv = process.env): EmailTransport {
  const name = env.EMAIL_TRANSPORT?.trim() || LOG_TRANSPORT_NAME;
  if (name === LOG_TRANSPORT_NAME) {
    return createLogEmailTransport({
      from: env.EMAIL_FROM?.trim() || DEFAULT_FROM,
      includeBody: shouldLogBody(env),
    });
  }
  if (name === SES_TRANSPORT_NAME) {
    return createSesTransport(env);
  }
  throw new Error(
    `EMAIL_TRANSPORT="${name}" is not supported; use "${LOG_TRANSPORT_NAME}" or "${SES_TRANSPORT_NAME}"`,
  );
}

function createSesTransport(env: NodeJS.ProcessEnv): EmailTransport {
  const from = env.EMAIL_FROM?.trim() ?? "";
  if (!from) {
    throw new EmailDeliveryError("EMAIL_FROM is required when EMAIL_TRANSPORT=ses");
  }
  const region = env.AWS_REGION?.trim() ?? "";
  if (!region) {
    throw new EmailDeliveryError("AWS_REGION is required when EMAIL_TRANSPORT=ses");
  }
  return createSesEmailTransport({
    from,
    mailer: createSesMailer(createSesClient(region)),
  });
}

function shouldLogBody(env: NodeJS.ProcessEnv): boolean {
  if (env.EMAIL_LOG_INCLUDE_BODY !== undefined) {
    return env.EMAIL_LOG_INCLUDE_BODY.trim().toLowerCase() === "true";
  }
  return env.NODE_ENV !== "production";
}
