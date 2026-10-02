import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  signSession,
  verifySession,
} from "@/lib/auth/session";

const SECRET = "unit-test-secret-value-at-least-32-chars";

const payload = {
  sub: "11111111-1111-4111-8111-111111111111",
  email: "server@ascend.test",
  role: "SERVER" as const,
};

describe("session cookie signing", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips a signed session", () => {
    const value = signSession(payload, SECRET, 24);
    expect(verifySession(value, SECRET)).toMatchObject(payload);
  });

  it("does not expose the secret inside the cookie value", () => {
    const value = signSession(payload, SECRET, 24);
    expect(value).not.toContain(SECRET);
  });

  it("rejects a tampered payload", () => {
    const value = signSession(payload, SECRET, 24);
    const [body, signature] = value.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...payload, role: "ADMIN", exp: 9999999999 }),
    ).toString("base64url");
    expect(body).not.toBe(forged);
    expect(verifySession(`${forged}.${signature}`, SECRET)).toBeNull();
  });

  it("rejects a session signed with a different secret", () => {
    const value = signSession(payload, "another-secret-value-at-least-32-chars", 24);
    expect(verifySession(value, SECRET)).toBeNull();
  });

  it("rejects an expired session", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const value = signSession(payload, SECRET, 1);
    expect(verifySession(value, SECRET)).toMatchObject(payload);

    vi.setSystemTime(new Date("2026-01-01T01:00:01.000Z"));
    expect(verifySession(value, SECRET)).toBeNull();
  });

  it("rejects malformed cookie values", () => {
    for (const bad of ["", "not-a-session", "a.b.c", "$$$.$$$"]) {
      expect(verifySession(bad, SECRET)).toBeNull();
    }
  });

  it("rejects a session carrying an unknown role", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const value = signSession(
      { ...payload, role: "OWNER" as unknown as "ADMIN" },
      SECRET,
      24,
    );
    expect(verifySession(value, SECRET)).toBeNull();
  });

  it("marks the cookie httpOnly, lax and site-wide", () => {
    const options = sessionCookieOptions({ ttlHours: 24, secure: true });
    expect(SESSION_COOKIE_NAME).toBe("ascend_session");
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    expect(options.secure).toBe(true);
    expect(options.maxAge).toBe(24 * 60 * 60);
    expect(sessionCookieOptions({ ttlHours: 1, secure: false }).secure).toBe(false);
  });
});
