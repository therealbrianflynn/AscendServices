import { log } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import type { ServeApplication } from "./application";

export class ServeSignupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServeSignupError";
  }
}

/**
 * Saves how a signed-in member can serve. The account already exists, so this
 * does not send a sign-in email.
 */
export async function submitServeApplication(
  input: ServeApplication & { userId: string },
): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: input.userId },
      data: {
        name: input.name,
        services_provided: input.services,
        bio: input.bio || null,
        phone: input.phone,
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
}
