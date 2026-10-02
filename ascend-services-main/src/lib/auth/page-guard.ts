import { notFound, redirect } from "next/navigation";

import { logRoleCheckFailure, readRoleFromDatabase, readSession } from "./guard";
import type { AppRole } from "./roles";
import type { SessionPayload } from "./session";

/** Where a signed-out visitor is sent to get a session. */
const SIGN_IN_PATH = "/signin";

/**
 * Page-level counterpart to `requireRole`: same database-authoritative role
 * check, but the two failures a browser can act on instead of JSON.
 *
 * A signed-out visitor is sent to sign in. A signed-in member without the role
 * gets a 404, not a 403 — a "forbidden" page confirms that the admin console
 * exists at this URL, and nobody who lacks the role needs to know that.
 */
export async function requireRoleForPage(role: AppRole): Promise<SessionPayload> {
  const session = await readSession();
  if (!session) redirect(SIGN_IN_PATH);

  const actualRole = await readRoleFromDatabase(session.sub);
  if (actualRole !== role) {
    logRoleCheckFailure({ actorId: session.sub, requiredRole: role, actualRole });
    notFound();
  }

  return session;
}
