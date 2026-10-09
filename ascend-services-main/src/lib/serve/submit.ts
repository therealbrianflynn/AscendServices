import { requestMagicLink } from "@/lib/auth/magic-link";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import type { ServeApplication } from "./application";

export class ServeSignupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServeSignupError";
  }
}

export interface ServeSignupResult {
  emailSent: boolean;
}

/**
 * Saves a serve application and tries to email a sign-in link.
 * A mail failure does not undo the profile: the background-check window
 * should still open.
 */
export async function submitServeApplication(
  input: ServeApplication,
): Promise<ServeSignupResult> {
  let emailSent = false;
  try {
    await requestMagicLink({ email: input.email, name: input.name });
    emailSent = true;
  } catch (err) {
    log({
      level: "error",
      msg: "serve_signup_email_failed",
      error: err instanceof Error ? err.message : "unknown",
    });
  }

  try {
    await prisma.user.update({
      where: { email: input.email },
      data: {
        name: input.name,
        services_provided: input.services,
        bio: input.bio || null,
      },
    });
  } catch (err) {
    log({
      level: "error",
      msg: "serve_signup_save_failed",
      error: err instanceof Error ? err.message : "unknown",
    });
    throw new ServeSignupError("Could not save the serve application");
  }

  return { emailSent };
}
