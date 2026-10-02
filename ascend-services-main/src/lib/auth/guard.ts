import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { log } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { publicIdentity, type PublicIdentity } from "./auth-user";
import { getAuthConfig } from "./config";
import { parseAppRole, type AppRole } from "./roles";
import { SESSION_COOKIE_NAME, verifySession, type SessionPayload } from "./session";

export const ROLE_CHECK_FAILED_ACTION = "ROLE_CHECK_FAILED";

export type GuardResult =
  | { ok: true; session: SessionPayload }
  | { ok: false; response: NextResponse };

export async function readSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  return verifySession(raw, getAuthConfig().sessionSecret);
}

export async function requireSession(): Promise<GuardResult> {
  const session = await readSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    };
  }
  return { ok: true, session };
}

/**
 * The caller's role as the database currently has it, so a revoked ADMIN loses
 * access immediately rather than when their cookie happens to expire. Returns
 * `null` for a signed cookie whose account no longer exists.
 */
export async function readRoleFromDatabase(userId: string): Promise<AppRole | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  return user ? parseAppRole(user.role) : null;
}

/** One log line for every denied role check, wherever the check happened. */
export function logRoleCheckFailure(fields: {
  actorId: string;
  requiredRole: AppRole;
  actualRole: AppRole | null;
}): void {
  log({
    level: "warn",
    msg: "role_check_failed",
    action: ROLE_CHECK_FAILED_ACTION,
    ...fields,
  });
}

/** Requires an authenticated caller holding `role` (re-read from the database). */
export async function requireRole(role: AppRole): Promise<GuardResult> {
  const guarded = await requireSession();
  if (!guarded.ok) return guarded;

  const actualRole = await readRoleFromDatabase(guarded.session.sub);

  if (actualRole !== role) {
    logRoleCheckFailure({
      actorId: guarded.session.sub,
      requiredRole: role,
      actualRole,
    });
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  return guarded;
}

export function sessionIdentity(session: SessionPayload): PublicIdentity {
  return publicIdentity({
    id: session.sub,
    email: session.email,
    role: session.role,
  });
}
