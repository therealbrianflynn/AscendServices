import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new NavigationError(`redirect:${path}`);
  }),
  notFound: vi.fn(() => {
    throw new NavigationError("not-found");
  }),
}));

vi.mock("@/lib/logger", () => ({ log: vi.fn() }));

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { requireRoleForPage } from "@/lib/auth/page-guard";
import { ADMIN_ROLE, SERVER_ROLE } from "@/lib/auth/roles";
import { SESSION_COOKIE_NAME, signSession } from "@/lib/auth/session";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

/** Stands in for the control-flow exceptions `redirect` / `notFound` throw. */
class NavigationError extends Error {}

const SECRET = process.env.AUTH_SESSION_SECRET as string;

const serverUser = {
  id: "44444444-4444-4444-8444-444444444444",
  email: "ada@ascend.test",
  role: SERVER_ROLE,
};

const adminUser = {
  id: "55555555-5555-4555-8555-555555555555",
  email: "admin@ascend.test",
  role: ADMIN_ROLE,
};

function signIn(user: { id: string; email: string; role: "SERVER" | "ADMIN" }) {
  const value = signSession({ sub: user.id, email: user.email, role: user.role }, SECRET, 24);
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      name === SESSION_COOKIE_NAME ? { name, value } : undefined,
  } as never);
}

function signOut() {
  vi.mocked(cookies).mockResolvedValue({ get: () => undefined } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  signOut();
});

describe("requireRoleForPage", () => {
  it("returns the session for a member who still holds the role", async () => {
    signIn(adminUser);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      role: ADMIN_ROLE,
    } as never);

    await expect(requireRoleForPage(ADMIN_ROLE)).resolves.toMatchObject({
      sub: adminUser.id,
      role: ADMIN_ROLE,
    });
    expect(redirect).not.toHaveBeenCalled();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor to sign in without touching the database", async () => {
    await expect(requireRoleForPage(ADMIN_ROLE)).rejects.toThrow("redirect:/signin");
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("answers 404 for a SERVER rather than confirming the console exists", async () => {
    signIn(serverUser);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      role: SERVER_ROLE,
    } as never);

    await expect(requireRoleForPage(ADMIN_ROLE)).rejects.toThrow("not-found");
    expect(notFound).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "role_check_failed",
        actorId: serverUser.id,
        requiredRole: ADMIN_ROLE,
        actualRole: SERVER_ROLE,
      }),
    );
  });

  it("answers 404 for a stale ADMIN cookie once the role was revoked", async () => {
    signIn({ ...serverUser, role: ADMIN_ROLE });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      role: SERVER_ROLE,
    } as never);

    await expect(requireRoleForPage(ADMIN_ROLE)).rejects.toThrow("not-found");
  });

  it("answers 404 for a signed cookie whose account no longer exists", async () => {
    signIn(adminUser);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

    await expect(requireRoleForPage(ADMIN_ROLE)).rejects.toThrow("not-found");
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "role_check_failed", actualRole: null }),
    );
  });
});
