export type ServeStep = "sign-in" | "passkey" | "offer";

/**
 * Offering to serve requires an existing session and at least one passkey.
 * A magic-link session alone stops at passkey enrolment.
 */
export function serveStep(input: { signedIn: boolean; passkeyCount: number }): ServeStep {
  if (!input.signedIn) return "sign-in";
  if (!Number.isInteger(input.passkeyCount) || input.passkeyCount < 1) return "passkey";
  return "offer";
}
