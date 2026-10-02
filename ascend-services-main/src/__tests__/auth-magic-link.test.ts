import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    magicLinkToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

const sendEmail = vi.fn();
vi.mock("@/lib/email", () => ({
  getEmailTransport: () => ({ send: sendEmail }),
}));

vi.mock("@/lib/logger", () => ({ log: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { hashMagicLinkToken } from "@/lib/auth/tokens";
import {
  InvalidEmailError,
  consumeMagicLink,
  requestMagicLink,
} from "@/lib/auth/magic-link";

const NOW = new Date("2026-03-01T12:00:00.000Z");

const existingUser = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Ada Server",
  email: "ada@ascend.test",
  role: "SERVER" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  process.env.MAGIC_LINK_TTL_MINUTES = "15";
  sendEmail.mockResolvedValue({ transport: "log", messageId: "msg-1" });
  vi.mocked(prisma.magicLinkToken.create).mockResolvedValue({} as never);
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("requestMagicLink", () => {
  it("creates a new SERVER user for an unknown email", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({
      ...existingUser,
      email: "new.volunteer@ascend.test",
      name: "new.volunteer",
    } as never);

    const result = await requestMagicLink({ email: "  New.Volunteer@Ascend.test " });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "new.volunteer@ascend.test" },
      select: expect.anything(),
    });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: "new.volunteer@ascend.test",
        name: "new.volunteer",
        role: "SERVER",
      },
      select: expect.anything(),
    });
    expect(result.created).toBe(true);
    expect(result.user.role).toBe("SERVER");
  });

  it("uses a supplied name for a new user", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue(existingUser as never);

    await requestMagicLink({ email: "ada@ascend.test", name: "  Ada Server  " });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Ada Server", role: "SERVER" }),
      }),
    );
  });

  it("reuses a known user without touching their role", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...existingUser,
      role: "ADMIN",
    } as never);

    const result = await requestMagicLink({ email: "ada@ascend.test" });

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(result.created).toBe(false);
    expect(result.user.role).toBe("ADMIN");
  });

  it("persists only the token hash with a ttl-bound expiry", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(existingUser as never);

    const result = await requestMagicLink({ email: existingUser.email });

    expect(prisma.magicLinkToken.create).toHaveBeenCalledWith({
      data: {
        token_hash: hashMagicLinkToken(result.token),
        userId: existingUser.id,
        expiresAt: new Date(NOW.getTime() + 15 * 60_000),
      },
    });
    const persisted = vi.mocked(prisma.magicLinkToken.create).mock.calls[0][0];
    expect(JSON.stringify(persisted)).not.toContain(result.token);
    expect(result.expiresAt).toEqual(new Date(NOW.getTime() + 15 * 60_000));
  });

  it("sends the link through the configured email transport", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(existingUser as never);
    process.env.APP_BASE_URL = "http://localhost:3000";

    const result = await requestMagicLink({ email: existingUser.email });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const message = sendEmail.mock.calls[0][0];
    expect(message.to).toBe(existingUser.email);
    expect(message.template).toBe("magic_link");
    expect(message.text).toContain(
      `http://localhost:3000/api/auth/callback?token=${result.token}`,
    );
  });

  it("records a magic-link request in the audit log without the token", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(existingUser as never);

    const result = await requestMagicLink({ email: existingUser.email });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "MAGIC_LINK_REQUESTED",
        actorId: existingUser.id,
      }),
    });
    const audit = vi.mocked(prisma.auditLog.create).mock.calls[0][0];
    expect(JSON.stringify(audit)).not.toContain(result.token);
  });

  it("rejects an email that is not a valid address", async () => {
    await expect(requestMagicLink({ email: "not-an-email" })).rejects.toBeInstanceOf(
      InvalidEmailError,
    );
    expect(prisma.magicLinkToken.create).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("consumeMagicLink", () => {
  const tokenRow = (overrides: Record<string, unknown> = {}) => ({
    id: "33333333-3333-4333-8333-333333333333",
    token_hash: "hash",
    userId: existingUser.id,
    expiresAt: new Date(NOW.getTime() + 60_000),
    consumedAt: null,
    user: existingUser,
    ...overrides,
  });

  it("returns the user and burns the token on the happy path", async () => {
    vi.mocked(prisma.magicLinkToken.findUnique).mockResolvedValue(tokenRow() as never);
    vi.mocked(prisma.magicLinkToken.updateMany).mockResolvedValue({ count: 1 } as never);

    const result = await consumeMagicLink("raw-token");

    expect(prisma.magicLinkToken.findUnique).toHaveBeenCalledWith({
      where: { token_hash: hashMagicLinkToken("raw-token") },
      include: { user: expect.anything() },
    });
    expect(prisma.magicLinkToken.updateMany).toHaveBeenCalledWith({
      where: { id: tokenRow().id, consumedAt: null },
      data: { consumedAt: NOW },
    });
    expect(result).toEqual({ ok: true, user: existingUser });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "USER_LOGIN",
        actorId: existingUser.id,
      }),
    });
  });

  it("rejects an unknown token", async () => {
    vi.mocked(prisma.magicLinkToken.findUnique).mockResolvedValue(null);

    expect(await consumeMagicLink("nope")).toEqual({ ok: false, reason: "invalid" });
    expect(prisma.magicLinkToken.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an empty token without hitting the database", async () => {
    expect(await consumeMagicLink("")).toEqual({ ok: false, reason: "invalid" });
    expect(prisma.magicLinkToken.findUnique).not.toHaveBeenCalled();
  });

  it("rejects an expired token and leaves it unconsumed", async () => {
    vi.mocked(prisma.magicLinkToken.findUnique).mockResolvedValue(
      tokenRow({ expiresAt: new Date(NOW.getTime() - 1) }) as never,
    );

    expect(await consumeMagicLink("stale")).toEqual({ ok: false, reason: "expired" });
    expect(prisma.magicLinkToken.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a token that was already consumed", async () => {
    vi.mocked(prisma.magicLinkToken.findUnique).mockResolvedValue(
      tokenRow({ consumedAt: new Date(NOW.getTime() - 5_000) }) as never,
    );

    expect(await consumeMagicLink("reused")).toEqual({ ok: false, reason: "consumed" });
    expect(prisma.magicLinkToken.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a token lost to a concurrent consume", async () => {
    vi.mocked(prisma.magicLinkToken.findUnique).mockResolvedValue(tokenRow() as never);
    vi.mocked(prisma.magicLinkToken.updateMany).mockResolvedValue({ count: 0 } as never);

    expect(await consumeMagicLink("raced")).toEqual({ ok: false, reason: "consumed" });
  });
});
