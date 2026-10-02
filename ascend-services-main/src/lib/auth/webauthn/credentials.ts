/**
 * Translation between stored `PasskeyCredential` rows and the shapes
 * `@simplewebauthn/server` expects, plus the projections the rest of the app is
 * allowed to see. `public_key` is the credential's public half — safe to store,
 * but it never needs to reach a browser, so no projection here exposes it.
 */
import type { WebAuthnCredential } from "@simplewebauthn/server";

export const CREDENTIAL_VERIFY_SELECT = {
  id: true,
  credential_id: true,
  userId: true,
  public_key: true,
  counter: true,
  transports: true,
} as const;

export const CREDENTIAL_DESCRIPTOR_SELECT = {
  credential_id: true,
  transports: true,
} as const;

export const CREDENTIAL_SUMMARY_SELECT = {
  id: true,
  label: true,
  device_type: true,
  backed_up: true,
  transports: true,
  lastUsedAt: true,
  createdAt: true,
} as const;

export interface StoredCredential {
  id: string;
  credential_id: string;
  userId: string;
  public_key: Uint8Array;
  counter: number;
  transports: string[];
}

export interface CredentialDescriptorRow {
  credential_id: string;
  transports: string[];
}

/** Metadata a member may see about their own passkeys. */
export interface PasskeySummary {
  id: string;
  label: string | null;
  deviceType: string;
  backedUp: boolean;
  transports: string[];
  lastUsedAt: string | null;
  createdAt: string;
}

export function toWebAuthnCredential(row: StoredCredential): WebAuthnCredential {
  return {
    id: row.credential_id,
    publicKey: toUint8Array(row.public_key),
    counter: row.counter,
    transports: row.transports,
  };
}

export function toCredentialDescriptors(
  rows: CredentialDescriptorRow[],
): { id: string; transports?: string[] }[] {
  return rows.map((row) => ({
    id: row.credential_id,
    ...(row.transports.length > 0 ? { transports: row.transports } : {}),
  }));
}

export function toPasskeySummary(row: {
  id: string;
  label: string | null;
  device_type: string;
  backed_up: boolean;
  transports: string[];
  lastUsedAt: Date | null;
  createdAt: Date;
}): PasskeySummary {
  return {
    id: row.id,
    label: row.label,
    deviceType: row.device_type,
    backedUp: row.backed_up,
    transports: row.transports,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Prisma returns `Bytes` as a `Uint8Array`, but a Node `Buffer` (a `Uint8Array`
 * subclass with a shared pool) can arrive from older drivers or fakes; copying
 * to a plain view keeps the verifier away from the rest of the pool.
 */
function toUint8Array(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy;
}
