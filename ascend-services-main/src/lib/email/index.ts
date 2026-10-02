import { createLogEmailTransport, LOG_TRANSPORT_NAME } from "./log-transport";
import type { EmailTransport } from "./transport";

export type { EmailMessage, EmailTransport, SentEmail } from "./transport";

const DEFAULT_FROM = "no-reply@ascend.local";

/**
 * Resolves the transport named by `EMAIL_TRANSPORT`. Only the structured-log
 * stub exists today; a real transport (Ethereal/SMTP) can be registered here
 * behind the same `EmailTransport` interface without touching callers.
 */
export function getEmailTransport(env: NodeJS.ProcessEnv = process.env): EmailTransport {
  const name = env.EMAIL_TRANSPORT?.trim() || LOG_TRANSPORT_NAME;
  if (name !== LOG_TRANSPORT_NAME) {
    throw new Error(
      `EMAIL_TRANSPORT="${name}" is not supported; only "${LOG_TRANSPORT_NAME}" is implemented`,
    );
  }
  return createLogEmailTransport({
    from: env.EMAIL_FROM?.trim() || DEFAULT_FROM,
    includeBody: shouldLogBody(env),
  });
}

function shouldLogBody(env: NodeJS.ProcessEnv): boolean {
  if (env.EMAIL_LOG_INCLUDE_BODY !== undefined) {
    return env.EMAIL_LOG_INCLUDE_BODY.trim().toLowerCase() === "true";
  }
  return env.NODE_ENV !== "production";
}
