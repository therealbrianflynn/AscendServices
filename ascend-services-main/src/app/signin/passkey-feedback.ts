/**
 * Member-facing copy for the stable error codes the passkey endpoints return,
 * plus the browser-side failures WebAuthn itself raises. Shared by the sign-in
 * and enrolment panels so the two never describe the same failure differently.
 */
const API_ERROR_MESSAGES: Record<string, string> = {
  ceremony_missing: "That took too long. Please try again.",
  challenge_invalid: "That took too long. Please try again.",
  challenge_expired: "That took too long. Please try again.",
  challenge_consumed: "That took too long. Please try again.",
  invalid_body: "Something went wrong on our side. Please try again.",
  unknown_credential:
    "We do not recognise that passkey. Use the email link below and add a passkey once you are in.",
  verification_failed:
    "We could not verify that passkey. Please try again, or use the email link below.",
  credential_already_registered: "That passkey is already on your account.",
  unauthenticated: "Your session expired. Please sign in again.",
};

const FALLBACK_MESSAGE = "Something went wrong. Please try again.";

/** The user dismissed or ignored the browser's passkey prompt. */
const CANCELLED_MESSAGE = "Passkey prompt cancelled.";

export function describeApiError(code: unknown): string {
  return (typeof code === "string" && API_ERROR_MESSAGES[code]) || FALLBACK_MESSAGE;
}

export function describeBrowserError(err: unknown): string {
  if (typeof err === "object" && err !== null && "name" in err) {
    const { name } = err as { name?: unknown };
    if (name === "NotAllowedError" || name === "AbortError") return CANCELLED_MESSAGE;
    if (name === "InvalidStateError") {
      return "That device already has a passkey for Ascend Services.";
    }
  }
  return FALLBACK_MESSAGE;
}
