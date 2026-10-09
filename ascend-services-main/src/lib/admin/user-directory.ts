import { requestMagicLink } from "@/lib/auth/magic-link";
import { parseAppRole, ADMIN_ROLE } from "@/lib/auth/roles";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import {
  assertAdminChangeIsSafe,
  ManagedUserError,
  nextDeactivatedAt,
  nextValidatedAt,
  type ManagedUserDraft,
} from "./managed-user";

const UNIQUE_CONSTRAINT = "P2002";

export interface SignInNotifier {
  (user: { email: string; name: string }): Promise<boolean>;
}

function isUniqueConflict(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === UNIQUE_CONSTRAINT
  );
}

async function emailSignInLink(user: { email: string; name: string }): Promise<boolean> {
  try {
    await requestMagicLink({ email: user.email, name: user.name });
    return true;
  } catch (err) {
    log({
      level: "error",
      msg: "managed_user_email_failed",
      error: err instanceof Error ? err.message : "unknown",
    });
    return false;
  }
}

async function countActiveAdmins(): Promise<number> {
  const admins = await prisma.user.findMany({
    where: { role: ADMIN_ROLE },
    select: { deactivatedAt: true },
  });
  return admins.filter((admin) => admin.deactivatedAt == null).length;
}

/**
 * Adds an active account and emails a sign-in link when the mailer is available.
 * The account is kept even when that email cannot be sent.
 */
export async function createManagedUser(
  draft: ManagedUserDraft,
  actorId: string,
  notify: SignInNotifier = emailSignInLink,
): Promise<{ id: string; emailSent: boolean }> {
  let created: { id: string; email: string; name: string };
  try {
    created = await prisma.user.create({
      data: {
        name: draft.name,
        email: draft.email,
        role: draft.role,
        bio: draft.bio.length > 0 ? draft.bio : null,
        services_provided: draft.services,
        validatedAt: nextValidatedAt(draft.role, draft.validated, null),
        deactivatedAt: null,
      },
      select: { id: true, email: true, name: true },
    });
  } catch (err) {
    if (isUniqueConflict(err)) throw new ManagedUserError("email_taken");
    throw err;
  }

  let emailSent = false;
  try {
    emailSent = await notify({ email: created.email, name: created.name });
  } catch (err) {
    log({
      level: "error",
      msg: "managed_user_email_failed",
      actorId,
      targetId: created.id,
      error: err instanceof Error ? err.message : "unknown",
    });
  }

  log({
    msg: "user_created",
    actorId,
    targetId: created.id,
    role: draft.role,
    emailSent,
  });

  return { id: created.id, emailSent };
}

/** Updates personal data, access level, and whether the account can sign in. */
export async function updateManagedUser(
  id: string,
  draft: ManagedUserDraft,
  actorId: string,
): Promise<void> {
  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      role: true,
      validatedAt: true,
      deactivatedAt: true,
    },
  });
  if (!target) throw new ManagedUserError("not_found");

  const owner = await prisma.user.findUnique({
    where: { email: draft.email },
    select: { id: true },
  });
  if (owner && owner.id !== target.id) throw new ManagedUserError("email_taken");

  const targetRole = parseAppRole(target.role);
  assertAdminChangeIsSafe({
    actorId,
    targetId: target.id,
    targetRole,
    targetActive: target.deactivatedAt == null,
    nextRole: draft.role,
    nextActive: draft.active,
    activeAdminCount: await countActiveAdmins(),
  });

  try {
    await prisma.user.update({
      where: { id: target.id },
      data: {
        name: draft.name,
        email: draft.email,
        role: draft.role,
        bio: draft.bio.length > 0 ? draft.bio : null,
        services_provided: draft.services,
        validatedAt: nextValidatedAt(draft.role, draft.validated, target.validatedAt),
        deactivatedAt: nextDeactivatedAt(draft.active, target.deactivatedAt),
      },
    });
  } catch (err) {
    if (isUniqueConflict(err)) throw new ManagedUserError("email_taken");
    log({
      level: "error",
      msg: "user_update_failed",
      actorId,
      targetId: target.id,
      error: err instanceof Error ? err.message : "unknown",
    });
    throw err;
  }

  log({
    msg: "user_updated",
    actorId,
    targetId: target.id,
    role: draft.role,
    active: draft.active,
  });
}
