/**
 * The identity every sign-in path resolves to, however the member proved who
 * they are (magic link, passkey, …). Shared so the projection and the role
 * parsing cannot drift between flows.
 */
import { parseAppRole, type AppRole } from "./roles";

export const AUTH_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
} as const;

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: AppRole;
}

/** The subset of an identity that may be handed back to a browser. */
export interface PublicIdentity {
  id: string;
  email: string;
  role: AppRole;
}

export function publicIdentity({
  id,
  email,
  role,
}: Pick<AuthUser, "id" | "email" | "role">): PublicIdentity {
  return { id, email, role };
}

export function toAuthUser(record: {
  id: string;
  name: string;
  email: string;
  role: string;
}): AuthUser {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    role: parseAppRole(record.role),
  };
}
