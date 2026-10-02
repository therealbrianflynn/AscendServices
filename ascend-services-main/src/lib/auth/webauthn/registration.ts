/**
 * Passkey enrolment (WebAuthn registration).
 *
 * Enrolment always happens inside an existing session: a member proves who they
 * are with the magic link (Task #12) and then adds a passkey. Letting an
 * unauthenticated caller bind a credential to an address would turn the passkey
 * flow into an account-takeover primitive.
 */
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/server";

import { log } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { consumeChallenge, issueChallenge } from "./challenge";
import { getWebAuthnConfig } from "./config";
import {
  CREDENTIAL_DESCRIPTOR_SELECT,
  toCredentialDescriptors,
  toPasskeySummary,
  type PasskeySummary,
} from "./credentials";

export const PASSKEY_REGISTERED_ACTION = "PASSKEY_REGISTERED";

const UNIQUE_CONSTRAINT_ERROR = "P2002";
const MAX_LABEL_LENGTH = 60;

export interface StartedRegistration {
  options: PublicKeyCredentialCreationOptionsJSON;
  ceremonyId: string;
  expiresAt: Date;
}

export type RegistrationRejection =
  | "unknown_user"
  | "challenge_invalid"
  | "challenge_expired"
  | "challenge_consumed"
  | "verification_failed"
  | "credential_already_registered";

export type FinishRegistrationResult =
  | { ok: true; passkey: PasskeySummary }
  | { ok: false; reason: RegistrationRejection };

export async function startPasskeyRegistration(
  userId: string,
): Promise<StartedRegistration | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });
  if (!user) return null;

  const config = getWebAuthnConfig();
  const enrolled = await prisma.passkeyCredential.findMany({
    where: { userId: user.id },
    select: CREDENTIAL_DESCRIPTOR_SELECT,
  });

  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpId,
    userID: new TextEncoder().encode(user.id),
    userName: user.email,
    userDisplayName: user.name,
    // `none` keeps attestation statements — which can identify the physical
    // device — out of the ceremony entirely. Ministry volunteers, not FIDO
    // certification, so there is nothing to gain from collecting them.
    attestationType: "none",
    // Re-enrolling an authenticator the member already has would silently
    // orphan the old row; the browser blocks it instead.
    excludeCredentials: toCredentialDescriptors(enrolled),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  const { ceremonyId, expiresAt } = await issueChallenge({
    ceremony: "REGISTRATION",
    challenge: options.challenge,
    userId: user.id,
  });

  return { options, ceremonyId, expiresAt };
}

export async function finishPasskeyRegistration({
  userId,
  ceremonyId,
  response,
  label,
}: {
  userId: string;
  ceremonyId: string;
  response: RegistrationResponseJSON;
  label?: string;
}): Promise<FinishRegistrationResult> {
  const consumed = await consumeChallenge({ ceremonyId, ceremony: "REGISTRATION" });
  if (!consumed.ok) return reject(`challenge_${consumed.reason}` as const, userId);

  // The cookie and the session must agree: a challenge minted for one member is
  // not usable by another, even if the cookie is somehow swapped in.
  if (consumed.userId !== userId) return reject("challenge_invalid", userId);

  const config = getWebAuthnConfig();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: consumed.challenge,
      expectedOrigin: config.origins,
      expectedRPID: config.rpId,
      requireUserVerification: false,
    });
  } catch (err) {
    return reject("verification_failed", userId, errorMessage(err));
  }

  if (!verification.verified) return reject("verification_failed", userId);

  const { credential, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;

  let created;
  try {
    created = await prisma.passkeyCredential.create({
      data: {
        credential_id: credential.id,
        userId,
        public_key: credential.publicKey,
        counter: credential.counter,
        transports: credential.transports ?? [],
        device_type: credentialDeviceType,
        backed_up: credentialBackedUp,
        label: normalizeLabel(label),
      },
      select: {
        id: true,
        label: true,
        device_type: true,
        backed_up: true,
        transports: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });
  } catch (err) {
    if (isCredentialCollision(err)) {
      return reject("credential_already_registered", userId);
    }
    throw err;
  }

  await prisma.auditLog.create({
    data: {
      actorId: userId,
      action: PASSKEY_REGISTERED_ACTION,
      // Device shape only: no credential id, public key or attestation data.
      metadata: {
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        transports: credential.transports ?? [],
      },
    },
  });

  log({
    msg: "passkey_registered",
    action: PASSKEY_REGISTERED_ACTION,
    actorId: userId,
    passkeyId: created.id,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
  });

  return { ok: true, passkey: toPasskeySummary(created) };
}

function reject(
  reason: RegistrationRejection,
  actorId: string,
  detail?: string,
): FinishRegistrationResult {
  log({
    level: "warn",
    msg: "passkey_registration_rejected",
    action: "PASSKEY_REGISTRATION_REJECTED",
    actorId,
    reason,
    ...(detail ? { detail } : {}),
  });
  return { ok: false, reason };
}

function normalizeLabel(label: unknown): string | null {
  const value = typeof label === "string" ? label.trim() : "";
  return value.length > 0 ? value.slice(0, MAX_LABEL_LENGTH) : null;
}

function isCredentialCollision(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const { code, meta } = err as { code?: unknown; meta?: { target?: unknown } };
  if (code !== UNIQUE_CONSTRAINT_ERROR) return false;
  const target = meta?.target;
  return Array.isArray(target)
    ? target.includes("credential_id")
    : target === "credential_id";
}

/**
 * Verifier errors describe *why* a response failed (bad origin, wrong RP ID);
 * they carry no credential material, so they are safe to record.
 */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "unknown";
}
