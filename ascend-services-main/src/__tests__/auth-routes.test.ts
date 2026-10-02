import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/magic-link", () => ({
  InvalidEmailError: class InvalidEmailError extends Error {},
  requestMagicLink: vi.fn(),
  consumeMagicLink: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

vi.mock("@/lib/logger", () => ({ log: vi.fn() }));

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  InvalidEmailError,
  consumeMagicLink,
  requestMagicLink,
} from "@/lib/auth/magic-link";
import { SESSION_COOKIE_NAME, signSession, verifySession } from "@/lib/auth/session";
import { POST as postMagicLink } from "@/app/api/auth/magic-link/route";
import { GET as getCallback } from "@/app/api/auth/callback/route";
import { GET as getSession } from "@/app/api/auth/session/route";
import { POST as postLogout } from "@/app/api/auth/logout/route";
import { GET as getAdminWhoami } from "@/app/api/admin/whoami/route";

const SECRET = process.env.AUTH_SESSION_SECRET as string;

const serverUser = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Ada Server",
  email: "ada@ascend.test",
  role: "SERVER" as const,
};

const adminUser = {
  id: "55555555-5555-4555-8555-555555555555",
  name: "Root Admin",
  email: "admin@ascend.test",
  role: "ADMIN" as const,
};

function mockCookieJar(value?: string) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      name === SESSION_COOKIE_NAME && value ? { name, value } : undefined,
  } as never);
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost:3000/api/auth/magic-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function sessionCookieFor(user: { id: string; email: string; role: "SERVER" | "ADMIN" }) {
  return signSession({ sub: user.id, email: user.email, role: user.role }, SECRET, 24);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCookieJar(undefined);
});

describe("POST /api/auth/magic-link", () => {
  it("accepts a request for a brand new email", async () => {
    vi.mocked(requestMagicLink).mockResolvedValue({
      user: serverUser,
      token: "raw-token",
      expiresAt: new Date("2026-03-01T12:15:00.000Z"),
      created: true,
    });

    const res = await postMagicLink(jsonRequest({ email: "ada@ascend.test" }));

    expect(res.status).toBe(202);
    await expect(res.json()).resolves.toEqual({ status: "sent" });
    expect(requestMagicLink).toHaveBeenCalledWith({
      email: "ada@ascend.test",
      name: undefined,
    });
  });

  it("never leaks the token or whether the account existed", async () => {
    vi.mocked(requestMagicLink).mockResolvedValue({
      user: serverUser,
      token: "raw-token",
      expiresAt: new Date(),
      created: false,
    });

    const res = await postMagicLink(jsonRequest({ email: serverUser.email }));
    const body = JSON.stringify(await res.json());

    expect(body).not.toContain("raw-token");
    expect(body).not.toContain("created");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("returns 400 for a malformed email", async () => {
    vi.mocked(requestMagicLink).mockRejectedValue(new InvalidEmailError("bad email"));

    const res = await postMagicLink(jsonRequest({ email: "nope" }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid_email" });
  });

  it("returns 400 when the body is not JSON", async () => {
    const res = await postMagicLink(
      new Request("http://localhost:3000/api/auth/magic-link", {
        method: "POST",
        body: "not json",
      }),
    );

    expect(res.status).toBe(400);
    expect(requestMagicLink).not.toHaveBeenCalled();
  });
});

describe("GET /api/auth/callback", () => {
  it("sets an httpOnly session cookie and redirects home", async () => {
    vi.mocked(consumeMagicLink).mockResolvedValue({ ok: true, user: serverUser });

    const res = await getCallback(
      new Request("http://localhost:3000/api/auth/callback?token=raw-token"),
    );

    expect(consumeMagicLink).toHaveBeenCalledWith("raw-token");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost:3000/");

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
    expect(setCookie).toContain("Path=/");

    const cookieValue = decodeURIComponent(
      setCookie.split(`${SESSION_COOKIE_NAME}=`)[1].split(";")[0],
    );
    expect(verifySession(cookieValue, SECRET)).toMatchObject({
      sub: serverUser.id,
      email: serverUser.email,
      role: "SERVER",
    });
  });

  it("rejects a reused token without setting a session", async () => {
    vi.mocked(consumeMagicLink).mockResolvedValue({ ok: false, reason: "consumed" });

    const res = await getCallback(
      new Request("http://localhost:3000/api/auth/callback?token=reused"),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "consumed" });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("rejects an expired token without setting a session", async () => {
    vi.mocked(consumeMagicLink).mockResolvedValue({ ok: false, reason: "expired" });

    const res = await getCallback(
      new Request("http://localhost:3000/api/auth/callback?token=stale"),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "expired" });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("returns 400 when the token query param is missing", async () => {
    const res = await getCallback(new Request("http://localhost:3000/api/auth/callback"));

    expect(res.status).toBe(400);
    expect(consumeMagicLink).not.toHaveBeenCalled();
  });
});

describe("GET /api/auth/session", () => {
  it("returns the signed-in identity", async () => {
    mockCookieJar(sessionCookieFor(serverUser));

    const res = await getSession();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      user: { id: serverUser.id, email: serverUser.email, role: "SERVER" },
    });
  });

  it("returns 401 without a session cookie", async () => {
    const res = await getSession();

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthenticated" });
  });

  it("returns 401 for a tampered session cookie", async () => {
    mockCookieJar(`${sessionCookieFor(serverUser)}tampered`);

    const res = await getSession();

    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the session cookie", async () => {
    mockCookieJar(sessionCookieFor(serverUser));

    const res = await postLogout();

    expect(res.status).toBe(204);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
  });
});

describe("GET /api/admin/whoami", () => {
  it("allows an ADMIN whose role is still ADMIN in the database", async () => {
    mockCookieJar(sessionCookieFor(adminUser));
    vi.mocked(prisma.user.findUnique).mockResolvedValue(adminUser as never);

    const res = await getAdminWhoami();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      user: { id: adminUser.id, email: adminUser.email, role: "ADMIN" },
    });
  });

  it("forbids a SERVER session", async () => {
    mockCookieJar(sessionCookieFor(serverUser));
    vi.mocked(prisma.user.findUnique).mockResolvedValue(serverUser as never);

    const res = await getAdminWhoami();

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "forbidden" });
  });

  it("forbids a stale ADMIN cookie once the role was revoked in the database", async () => {
    mockCookieJar(sessionCookieFor({ ...serverUser, role: "ADMIN" }));
    vi.mocked(prisma.user.findUnique).mockResolvedValue(serverUser as never);

    const res = await getAdminWhoami();

    expect(res.status).toBe(403);
  });

  it("requires a session", async () => {
    const res = await getAdminWhoami();

    expect(res.status).toBe(401);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
