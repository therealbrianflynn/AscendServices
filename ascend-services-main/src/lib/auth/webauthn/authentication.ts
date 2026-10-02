/**
 * Passkey sign-in (WebAuthn authentication).
 *
 * Resolves to the same `AuthUser` the magic-link flow produces, so the session
 * cookie, the roles and the audit trail are identical whichever path a member
 * used. Magic link stays available as the fallback for anyone without a passkey.
 */
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/server";

import { log } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { AUTH_USER_SELECT, toAuthUser, type AuthUser } from "../auth-user";
import { InvalidEmailError, normalizeEmail } from "../email-address";
import { consumeChallenge, issueChallenge } from "./challenge";
import { getWebAuthnConfig } from "./config";
import {
  CREDENTIAL_DESCRIPTOR_SELECT,
  CREDENTIAL_VERIFY_SELECT,
  toCredentialDescriptors,
  toWebAuthnCredential,
} from "./credentials";

export const PASSKEY_LOGIN_ACTION = "USER_LOGIN";
export const PASSKEY_LOGIN_METHOD = "passkey";

export interface StartedAuthentication {
  options: PublicKeyCredentialRequestOptionsJSON;
  ceremonyId: string;
  expiresAt: Date;
}

export type AuthenticationRejection =
  | "challenge_invalid"
  | "challenge_expired"
  | "challenge_consumed"
  | "unknown_credential"
  | "verification_failed";

export type FinishAuthenticationResult =
  | { ok: true; user: AuthUser }
  | { ok: false; reason: AuthenticationRejection };

/**
 * An email is optional and, when given, is only a hint: it narrows the ceremony
 * to that member's credentials. An unknown or malformed address still yields a
 * usable discoverable-credential ceremony, so this endpoint cannot be used to
 * find out who has an account.
 */
export async function startPasskeyAuthentication({
  email,
}: { email?: string } = {}): Promise<StartedAuthentication> {
  const config = getWebAuthnConfig();
  const user = await findUserByEmail(email);

  const credentials = user
    ? await prisma.passkeyCredential.findMany({
        where: { userId: user.id },
        select: CREDENTIAL_DESCRIPTOR_SELECT,
      })
    : [];

  const options = await generateAuthenticationOptions({
    rpID: config.rpId,
    userVerification: "preferred",
    // Omitted when we have no hint, which lets the browser offer whichever
    // discoverable passkey the member has for this site.
    ...(credentials.length > 0
      ? { allowCredentials: toCredentialDescriptors(credentials) }
      : {}),
  });

  const { ceremonyId, expiresAt } = await issueChallenge({
    ceremony: "AUTHENTICATION",
    challenge: options.challenge,
    userId: user?.id ?? null,
  });

  return { options, ceremonyId, expiresAt };
}

export async function finishPasskeyAuthentication({
  ceremonyId,
  response,
}: {
  ceremonyId: string;
  response: AuthenticationResponseJSON;
}): Promise<FinishAuthenticationResult> {
  const consumed = await consumeChallenge({ ceremonyId, ceremony: "AUTHENTICATION" });
  if (!consumed.ok) return reject(`challenge_${consumed.reason}` as const);

  const credentialId = typeof response?.id === "string" ? response.id : "";
  const stored = credentialId
    ? await prisma.passkeyCredential.findUnique({
        where: { credential_id: credentialId },
        select: { ...CREDENTIAL_VERIFY_SELECT, user: { select: AUTH_USER_SELECT } },
      })
    : null;

  if (!stored) return reject("unknown_credential");

  // When the member named themselves up front, the assertion has to come from
  // one of *their* credentials.
  if (consumed.userId && consumed.userId !== stored.userId) {
    return reject("unknown_credential", stored.userId);
  }
  if (!userHandleMatches(response, stored.userId)) {
    return reject("verification_failed", stored.userId);
  }

  const config = getWebAuthnConfig();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: consumed.challenge,
      expectedOrigin: config.origins,
      expectedRPID: config.rpId,
      credential: toWebAuthnCredential(stored),
      requireUserVerification: false,
    });
  } catch (err) {
    return reject("verification_failed", stored.userId, errorMessage(err));
  }

  if (!verification.verified) return reject("verification_failed", stored.userId);

  const user = toAuthUser(stored.user);

  await prisma.passkeyCredential.update({
    where: { id: stored.id },
    data: {
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: PASSKEY_LOGIN_ACTION,
      metadata: { method: PASSKEY_LOGIN_METHOD },
    },
  });

  log({
    msg: "passkey_authenticated",
    action: PASSKEY_LOGIN_ACTION,
    actorId: user.id,
    method: PASSKEY_LOGIN_METHOD,
    passkeyId: stored.id,
  });

  return { ok: true, user };
}

async function findUserByEmail(email?: string): Promise<{ id: string } | null> {
  if (typeof email !== "string" || email.trim().length === 0) return null;

  let normalized: string;
  try {
    normalized = normalizeEmail(email);
  } catch (err) {
    if (err instanceof InvalidEmailError) return null;
    throw err;
  }

  return prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true },
  });
}

/**
 * Discoverable credentials return the user handle we set at enrolment (the
 * `User.id` as UTF-8). If the authenticator asserts a different owner than the
 * credential we looked up, something is wrong — refuse rather than guess.
 */
function userHandleMatches(response: AuthenticationResponseJSON, userId: string): boolean {
  const handle = response?.response?.userHandle;
  if (typeof handle !== "string" || handle.length === 0) return true;

  try {
    return Buffer.from(handle, "base64url").toString("utf8") === userId;
  } catch {
    return false;
  }
}

function reject(
  reason: AuthenticationRejection,
  actorId?: string,
  detail?: string,
): FinishAuthenticationResult {
  log({
    level: "warn",
    msg: "passkey_authentication_rejected",
    action: "PASSKEY_AUTH_REJECTED",
    reason,
    ...(actorId ? { actorId } : {}),
    ...(detail ? { detail } : {}),
  });
  return { ok: false, reason };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "unknown";
}
