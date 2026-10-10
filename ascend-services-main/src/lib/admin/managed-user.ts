import { InvalidEmailError, normalizeEmail } from "@/lib/auth/email-address";
import { ADMIN_ROLE, isAppRole, SERVER_ROLE, type AppRole } from "@/lib/auth/roles";
import { parseOptionalPhone } from "@/lib/phone";

export const ROLE_LABELS: Record<AppRole, string> = {
  ADMIN: "Admin",
  SERVER: "Server",
  REQUESTER: "Requester",
};

const NAME_MAX = 80;
const BIO_MAX = 500;

export type ManagedUserFailure =
  | "invalid"
  | "not_found"
  | "email_taken"
  | "last_admin"
  | "self_deactivate";

export class ManagedUserError extends Error {
  readonly code: ManagedUserFailure;

  constructor(code: ManagedUserFailure) {
    super(code);
    this.name = "ManagedUserError";
    this.code = code;
  }
}

export interface ManagedUserDraft {
  name: string;
  email: string;
  role: AppRole;
  bio: string;
  phone: string | null;
  services: string[];
  validated: boolean;
  active: boolean;
}

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The personal record an admin may set: name, email, how they serve, a short
 * bio, access level, whether a server is validated, and whether the account
 * is active.
 */
export function parseManagedUser(
  source: unknown,
  allowedServices: readonly string[],
): ManagedUserDraft {
  if (typeof source !== "object" || source === null) {
    throw new ManagedUserError("invalid");
  }
  const body = source as Record<string, unknown>;

  const name = readString(body, "name");
  if (name.length === 0 || name.length > NAME_MAX) {
    throw new ManagedUserError("invalid");
  }

  let email: string;
  try {
    email = normalizeEmail(body.email);
  } catch (err) {
    if (err instanceof InvalidEmailError) throw new ManagedUserError("invalid");
    throw err;
  }

  if (!isAppRole(body.role)) throw new ManagedUserError("invalid");

  const bio = readString(body, "bio");
  if (bio.length > BIO_MAX) throw new ManagedUserError("invalid");

  const phone = parseOptionalPhone(body.phone);
  if (!phone.ok) throw new ManagedUserError("invalid");

  if (!Array.isArray(body.services)) throw new ManagedUserError("invalid");
  const services: string[] = [];
  for (const service of body.services) {
    if (typeof service !== "string" || !allowedServices.includes(service)) {
      throw new ManagedUserError("invalid");
    }
    if (!services.includes(service)) services.push(service);
  }

  if (typeof body.validated !== "boolean") throw new ManagedUserError("invalid");
  if (typeof body.active !== "boolean") throw new ManagedUserError("invalid");

  return {
    name,
    email,
    role: body.role,
    bio,
    phone: phone.phone,
    services,
    validated: body.validated,
    active: body.active,
  };
}

/**
 * Validation only opens the Help Wanted board for a server. Other roles never
 * keep the stamp. Turning validation on again keeps the original timestamp.
 */
export function nextValidatedAt(
  role: AppRole,
  validated: boolean,
  current: Date | null | undefined,
): Date | null {
  if (role !== SERVER_ROLE || !validated) return null;
  return current ?? new Date();
}

/** Reactivating clears the stamp. Deactivating keeps the original timestamp. */
export function nextDeactivatedAt(
  active: boolean,
  current: Date | null | undefined,
): Date | null {
  if (active) return null;
  return current ?? new Date();
}

/**
 * The ministry must keep one active admin, and an admin cannot lock themselves
 * out of their own account.
 */
export function assertAdminChangeIsSafe(input: {
  actorId: string;
  targetId: string;
  targetRole: AppRole;
  targetActive: boolean;
  nextRole: AppRole;
  nextActive: boolean;
  activeAdminCount: number;
}): void {
  const targetIsActiveAdmin = input.targetRole === ADMIN_ROLE && input.targetActive;
  const staysActiveAdmin = input.nextRole === ADMIN_ROLE && input.nextActive;
  if (targetIsActiveAdmin && !staysActiveAdmin && input.activeAdminCount <= 1) {
    throw new ManagedUserError("last_admin");
  }
  if (input.actorId === input.targetId && !input.nextActive) {
    throw new ManagedUserError("self_deactivate");
  }
}
