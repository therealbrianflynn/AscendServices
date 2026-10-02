import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaProxy = vi.hoisted(() => {
  const holder: { current: Record<string | symbol, unknown> | null } = { current: null };
  return {
    holder,
    proxy: new Proxy({}, { get: (_target, property) => holder.current?.[property] }),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaProxy.proxy }));

import { consumeChallenge, issueChallenge } from "@/lib/auth/webauthn/challenge";

import { createFakeAuthPrisma, type FakeAuthPrisma } from "./helpers/fake-auth-prisma";

const NOW = new Date("2026-03-01T12:00:00.000Z");
const USER_ID = "88888888-8888-4888-8888-888888888888";

let db: FakeAuthPrisma;

beforeEach(() => {
  db = createFakeAuthPrisma();
  prismaProxy.holder.current = db.client as Record<string | symbol, unknown>;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  process.env.APP_BASE_URL = "http://localhost:3000";
  process.env.WEBAUTHN_CHALLENGE_TTL_MINUTES = "5";
});

afterEach(() => {
  vi.useRealTimers();
  prismaProxy.holder.current = null;
  delete process.env.WEBAUTHN_CHALLENGE_TTL_MINUTES;
});

describe("issueChallenge", () => {
  it("stores the challenge with a TTL-bound expiry", async () => {
    const issued = await issueChallenge({
      ceremony: "AUTHENTICATION",
      challenge: "chal-1",
    });

    expect(issued.expiresAt).toEqual(new Date(NOW.getTime() + 5 * 60_000));
    expect(db.challenges).toHaveLength(1);
    expect(db.challenges[0]).toMatchObject({
      id: issued.ceremonyId,
      ceremony: "AUTHENTICATION",
      challenge: "chal-1",
      userId: null,
      consumedAt: null,
    });
  });

  it("binds the challenge to a member when one is known", async () => {
    await issueChallenge({
      ceremony: "REGISTRATION",
      challenge: "chal-2",
      userId: USER_ID,
    });

    expect(db.challenges[0].userId).toBe(USER_ID);
  });

  it("sweeps challenges that have already expired", async () => {
    await issueChallenge({ ceremony: "AUTHENTICATION", challenge: "stale" });

    vi.setSystemTime(new Date(NOW.getTime() + 6 * 60_000));
    const fresh = await issueChallenge({ ceremony: "AUTHENTICATION", challenge: "new" });

    expect(db.challenges.map((row) => row.id)).toEqual([fresh.ceremonyId]);
  });

  it("still issues when the opportunistic sweep fails", async () => {
    const client = db.client as { webAuthnChallenge: { deleteMany: unknown } };
    client.webAuthnChallenge.deleteMany = async () => {
      throw new Error("connection reset");
    };

    await expect(
      issueChallenge({ ceremony: "AUTHENTICATION", challenge: "chal-3" }),
    ).resolves.toMatchObject({ ceremonyId: expect.any(String) });
  });
});

describe("consumeChallenge", () => {
  it("returns the challenge once and burns it", async () => {
    const issued = await issueChallenge({
      ceremony: "REGISTRATION",
      challenge: "chal-4",
      userId: USER_ID,
    });

    const first = await consumeChallenge({
      ceremonyId: issued.ceremonyId,
      ceremony: "REGISTRATION",
    });
    const second = await consumeChallenge({
      ceremonyId: issued.ceremonyId,
      ceremony: "REGISTRATION",
    });

    expect(first).toEqual({ ok: true, challenge: "chal-4", userId: USER_ID });
    expect(second).toEqual({ ok: false, reason: "consumed" });
  });

  it("refuses a challenge minted for the other ceremony", async () => {
    const issued = await issueChallenge({
      ceremony: "REGISTRATION",
      challenge: "chal-5",
      userId: USER_ID,
    });

    const result = await consumeChallenge({
      ceremonyId: issued.ceremonyId,
      ceremony: "AUTHENTICATION",
    });

    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(db.challenges[0].consumedAt).toBeNull();
  });

  it("refuses an expired challenge", async () => {
    const issued = await issueChallenge({
      ceremony: "AUTHENTICATION",
      challenge: "chal-6",
    });

    vi.setSystemTime(new Date(NOW.getTime() + 5 * 60_000 + 1));
    const result = await consumeChallenge({
      ceremonyId: issued.ceremonyId,
      ceremony: "AUTHENTICATION",
    });

    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("refuses an unknown or empty ceremony id", async () => {
    await expect(
      consumeChallenge({ ceremonyId: "nope", ceremony: "AUTHENTICATION" }),
    ).resolves.toEqual({ ok: false, reason: "invalid" });
    await expect(
      consumeChallenge({ ceremonyId: "  ", ceremony: "AUTHENTICATION" }),
    ).resolves.toEqual({ ok: false, reason: "invalid" });
  });

  it("lets only one of two concurrent redemptions win", async () => {
    const issued = await issueChallenge({
      ceremony: "AUTHENTICATION",
      challenge: "chal-7",
    });

    const [first, second] = await Promise.all([
      consumeChallenge({ ceremonyId: issued.ceremonyId, ceremony: "AUTHENTICATION" }),
      consumeChallenge({ ceremonyId: issued.ceremonyId, ceremony: "AUTHENTICATION" }),
    ]);

    expect([first.ok, second.ok].sort()).toEqual([false, true]);
  });
});
