/**
 * Server-side WebAuthn challenge store.
 *
 * The challenge lives in Postgres (`WebAuthnChallenge`) rather than in a cookie
 * so that single-use is enforced by the database — the same conditional-update
 * burn the magic-link flow uses — instead of by trusting the client to discard
 * it. The browser only carries the row id, in a short-lived httpOnly cookie.
 */
import { prisma } from "@/lib/prisma";

import { getWebAuthnConfig } from "./config";

export type WebAuthnCeremony = "REGISTRATION" | "AUTHENTICATION";

export interface IssuedChallenge {
  /** Row id; handed to the browser as the ceremony cookie value. */
  ceremonyId: string;
  expiresAt: Date;
}

export type ChallengeRejection = "invalid" | "expired" | "consumed";

export type ConsumeChallengeResult =
  | { ok: true; challenge: string; userId: string | null }
  | { ok: false; reason: ChallengeRejection };

export async function issueChallenge({
  ceremony,
  challenge,
  userId,
}: {
  ceremony: WebAuthnCeremony;
  challenge: string;
  userId?: string | null;
}): Promise<IssuedChallenge> {
  const { challengeTtlMinutes } = getWebAuthnConfig();
  const expiresAt = new Date(Date.now() + challengeTtlMinutes * 60_000);

  const record = await prisma.webAuthnChallenge.create({
    data: { ceremony, challenge, userId: userId ?? null, expiresAt },
    select: { id: true, expiresAt: true },
  });

  await purgeExpiredChallenges();

  return { ceremonyId: record.id, expiresAt: record.expiresAt };
}

/**
 * Redeems a challenge exactly once for the named ceremony. The ceremony is part
 * of the lookup, so an enrolment challenge can never be replayed as a sign-in.
 */
export async function consumeChallenge({
  ceremonyId,
  ceremony,
}: {
  ceremonyId: string;
  ceremony: WebAuthnCeremony;
}): Promise<ConsumeChallengeResult> {
  const id = typeof ceremonyId === "string" ? ceremonyId.trim() : "";
  if (id.length === 0) return { ok: false, reason: "invalid" };

  const record = await prisma.webAuthnChallenge.findUnique({
    where: { id },
    select: {
      id: true,
      ceremony: true,
      challenge: true,
      userId: true,
      expiresAt: true,
      consumedAt: true,
    },
  });

  if (!record || record.ceremony !== ceremony) return { ok: false, reason: "invalid" };
  if (record.consumedAt) return { ok: false, reason: "consumed" };

  const now = new Date();
  if (record.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "expired" };
  }

  const burned = await prisma.webAuthnChallenge.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: now },
  });
  if (burned.count === 0) return { ok: false, reason: "consumed" };

  return { ok: true, challenge: record.challenge, userId: record.userId };
}

/**
 * Challenges are worthless once expired; dropping them keeps the table bounded
 * without a scheduled job. Best-effort: a failed sweep must not fail a sign-in.
 */
async function purgeExpiredChallenges(): Promise<void> {
  try {
    await prisma.webAuthnChallenge.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  } catch {
    // Intentionally ignored: cleanup is opportunistic, not part of the ceremony.
  }
}
