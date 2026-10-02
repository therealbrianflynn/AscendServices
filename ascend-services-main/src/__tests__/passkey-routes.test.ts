import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/webauthn/registration", () => ({
  startPasskeyRegistration: vi.fn(),
  finishPasskeyRegistration: vi.fn(),
}));

vi.mock("@/lib/auth/webauthn/authentication", () => ({
  PASSKEY_LOGIN_METHOD: "passkey",
  startPasskeyAuthentication: vi.fn(),
  finishPasskeyAuthentication: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

vi.mock("@/lib/logger", () => ({ log: vi.fn() }));

import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME, signSession, verifySession } from "@/lib/auth/session";
import { WEBAUTHN_CEREMONY_COOKIE_NAME } from "@/lib/auth/webauthn/ceremony-cookie";
import {
  finishPasskeyAuthentication,
  startPasskeyAuthentication,
} from "@/lib/auth/webauthn/authentication";
import {
  finishPasskeyRegistration,
  startPasskeyRegistration,
} from "@/lib/auth/webauthn/registration";
import { POST as postRegisterOptions } from "@/app/api/auth/passkey/register/options/route";
import { POST as postRegisterVerify } from "@/app/api/auth/passkey/register/verify/route";
import { POST as postAuthOptions } from "@/app/api/auth/passkey/authenticate/options/route";
import { POST as postAuthVerify } from "@/app/api/auth/passkey/authenticate/verify/route";

const SECRET = process.env.AUTH_SESSION_SECRET as string;
const CEREMONY_ID = "ceremony-1";

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

const registrationOptions = { challenge: "reg-challenge", rp: { id: "localhost" } };
const authenticationOptions = { challenge: "auth-challenge", rpId: "localhost" };
const attestation = { id: "cred-1", response: { attestationObject: "att-blob" } };
const assertion = { id: "cred-1", response: { signature: "sig-blob" } };

const passkeySummary = {
  id: "passkey-1",
  label: "Work laptop",
  deviceType: "multiDevice",
  backedUp: true,
  transports: ["internal"],
  lastUsedAt: null,
  createdAt: "2026-03-01T12:00:00.000Z",
};

function mockCookieJar(jar: Record<string, string>) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (jar[name] ? { name, value: jar[name] } : undefined),
  } as never);
}

function signedInAs(user: { id: string; email: string; role: "SERVER" | "ADMIN" }) {
  return signSession({ sub: user.id, email: user.email, role: user.role }, SECRET, 24);
}

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function cookieValue(response: Response, name: string): string | null {
  const header = response.headers.get("set-cookie") ?? "";
  const match = header.split(`${name}=`)[1];
  return match === undefined ? null : decodeURIComponent(match.split(";")[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCookieJar({});
  process.env.APP_BASE_URL = "http://localhost:3000";
});

describe("POST /api/auth/passkey/register/options", () => {
  it("returns options and pins the ceremony to an httpOnly cookie", async () => {
    mockCookieJar({ [SESSION_COOKIE_NAME]: signedInAs(serverUser) });
    vi.mocked(startPasskeyRegistration).mockResolvedValue({
      options: registrationOptions as never,
      ceremonyId: CEREMONY_ID,
      expiresAt: new Date(Date.now() + 5 * 60_000),
    });

    const res = await postRegisterOptions();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ options: registrationOptions });
    expect(startPasskeyRegistration).toHaveBeenCalledWith(serverUser.id);

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(cookieValue(res, WEBAUTHN_CEREMONY_COOKIE_NAME)).toBe(CEREMONY_ID);
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=strict");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("requires a session", async () => {
    const res = await postRegisterOptions();

    expect(res.status).toBe(401);
    expect(startPasskeyRegistration).not.toHaveBeenCalled();
  });

  it("answers 401 when the session points at a user that no longer exists", async () => {
    mockCookieJar({ [SESSION_COOKIE_NAME]: signedInAs(serverUser) });
    vi.mocked(startPasskeyRegistration).mockResolvedValue(null);

    const res = await postRegisterOptions();

    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/passkey/register/verify", () => {
  const url = "http://localhost:3000/api/auth/passkey/register/verify";

  it("stores the passkey and clears the ceremony cookie", async () => {
    mockCookieJar({
      [SESSION_COOKIE_NAME]: signedInAs(serverUser),
      [WEBAUTHN_CEREMONY_COOKIE_NAME]: CEREMONY_ID,
    });
    vi.mocked(finishPasskeyRegistration).mockResolvedValue({
      ok: true,
      passkey: passkeySummary,
    });

    const res = await postRegisterVerify(
      jsonRequest(url, { response: attestation, label: "Work laptop" }),
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ passkey: passkeySummary });
    expect(finishPasskeyRegistration).toHaveBeenCalledWith({
      userId: serverUser.id,
      ceremonyId: CEREMONY_ID,
      response: attestation,
      label: "Work laptop",
    });
    expect(res.headers.get("set-cookie")).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
  });

  it("never echoes the attestation blob back to the caller", async () => {
    mockCookieJar({
      [SESSION_COOKIE_NAME]: signedInAs(serverUser),
      [WEBAUTHN_CEREMONY_COOKIE_NAME]: CEREMONY_ID,
    });
    vi.mocked(finishPasskeyRegistration).mockResolvedValue({
      ok: true,
      passkey: passkeySummary,
    });

    const res = await postRegisterVerify(jsonRequest(url, { response: attestation }));

    expect(JSON.stringify(await res.json())).not.toContain("att-blob");
  });

  it("requires a session before touching the ceremony", async () => {
    mockCookieJar({ [WEBAUTHN_CEREMONY_COOKIE_NAME]: CEREMONY_ID });

    const res = await postRegisterVerify(jsonRequest(url, { response: attestation }));

    expect(res.status).toBe(401);
    expect(finishPasskeyRegistration).not.toHaveBeenCalled();
  });

  it("returns 400 without a ceremony cookie", async () => {
    mockCookieJar({ [SESSION_COOKIE_NAME]: signedInAs(serverUser) });

    const res = await postRegisterVerify(jsonRequest(url, { response: attestation }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "ceremony_missing" });
    expect(finishPasskeyRegistration).not.toHaveBeenCalled();
  });

  it("returns 400 when the body carries no response", async () => {
    mockCookieJar({
      [SESSION_COOKIE_NAME]: signedInAs(serverUser),
      [WEBAUTHN_CEREMONY_COOKIE_NAME]: CEREMONY_ID,
    });

    const res = await postRegisterVerify(jsonRequest(url, { label: "Nope" }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid_body" });
  });

  it("maps a verification failure to 400 and clears the spent ceremony", async () => {
    mockCookieJar({
      [SESSION_COOKIE_NAME]: signedInAs(serverUser),
      [WEBAUTHN_CEREMONY_COOKIE_NAME]: CEREMONY_ID,
    });
    vi.mocked(finishPasskeyRegistration).mockResolvedValue({
      ok: false,
      reason: "verification_failed",
    });

    const res = await postRegisterVerify(jsonRequest(url, { response: attestation }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "verification_failed" });
    expect(res.headers.get("set-cookie")).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
  });

  it("maps an already-registered credential to 409", async () => {
    mockCookieJar({
      [SESSION_COOKIE_NAME]: signedInAs(serverUser),
      [WEBAUTHN_CEREMONY_COOKIE_NAME]: CEREMONY_ID,
    });
    vi.mocked(finishPasskeyRegistration).mockResolvedValue({
      ok: false,
      reason: "credential_already_registered",
    });

    const res = await postRegisterVerify(jsonRequest(url, { response: attestation }));

    expect(res.status).toBe(409);
  });
});

describe("POST /api/auth/passkey/authenticate/options", () => {
  const url = "http://localhost:3000/api/auth/passkey/authenticate/options";

  beforeEach(() => {
    vi.mocked(startPasskeyAuthentication).mockResolvedValue({
      options: authenticationOptions as never,
      ceremonyId: CEREMONY_ID,
      expiresAt: new Date(Date.now() + 5 * 60_000),
    });
  });

  it("starts a ceremony for a signed-out visitor", async () => {
    const res = await postAuthOptions(jsonRequest(url, { email: "ada@ascend.test" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ options: authenticationOptions });
    expect(startPasskeyAuthentication).toHaveBeenCalledWith({
      email: "ada@ascend.test",
    });
    expect(cookieValue(res, WEBAUTHN_CEREMONY_COOKIE_NAME)).toBe(CEREMONY_ID);
  });

  it("starts a discoverable ceremony when no email is offered", async () => {
    const res = await postAuthOptions(jsonRequest(url, {}));

    expect(res.status).toBe(200);
    expect(startPasskeyAuthentication).toHaveBeenCalledWith({ email: undefined });
  });

  it("tolerates a body that is not JSON at all", async () => {
    const res = await postAuthOptions(new Request(url, { method: "POST", body: "nope" }));

    expect(res.status).toBe(200);
    expect(startPasskeyAuthentication).toHaveBeenCalledWith({ email: undefined });
  });
});

describe("POST /api/auth/passkey/authenticate/verify", () => {
  const url = "http://localhost:3000/api/auth/passkey/authenticate/verify";

  it("issues the same session cookie the magic-link callback issues", async () => {
    mockCookieJar({ [WEBAUTHN_CEREMONY_COOKIE_NAME]: CEREMONY_ID });
    vi.mocked(finishPasskeyAuthentication).mockResolvedValue({
      ok: true,
      user: serverUser,
    });

    const res = await postAuthVerify(jsonRequest(url, { response: assertion }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      user: { id: serverUser.id, email: serverUser.email, role: "SERVER" },
    });

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
    expect(verifySession(cookieValue(res, SESSION_COOKIE_NAME)!, SECRET)).toMatchObject({
      sub: serverUser.id,
      email: serverUser.email,
      role: "SERVER",
    });
  });

  it("carries the ADMIN role through to the session", async () => {
    mockCookieJar({ [WEBAUTHN_CEREMONY_COOKIE_NAME]: CEREMONY_ID });
    vi.mocked(finishPasskeyAuthentication).mockResolvedValue({
      ok: true,
      user: adminUser,
    });

    const res = await postAuthVerify(jsonRequest(url, { response: assertion }));

    expect(verifySession(cookieValue(res, SESSION_COOKIE_NAME)!, SECRET)).toMatchObject({
      role: "ADMIN",
    });
  });

  it("answers 401 without a session cookie when verification fails", async () => {
    mockCookieJar({ [WEBAUTHN_CEREMONY_COOKIE_NAME]: CEREMONY_ID });
    vi.mocked(finishPasskeyAuthentication).mockResolvedValue({
      ok: false,
      reason: "verification_failed",
    });

    const res = await postAuthVerify(jsonRequest(url, { response: assertion }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "verification_failed" });
    expect(res.headers.get("set-cookie")).not.toContain(`${SESSION_COOKIE_NAME}=ey`);
  });

  it("answers 401 for an unknown credential", async () => {
    mockCookieJar({ [WEBAUTHN_CEREMONY_COOKIE_NAME]: CEREMONY_ID });
    vi.mocked(finishPasskeyAuthentication).mockResolvedValue({
      ok: false,
      reason: "unknown_credential",
    });

    const res = await postAuthVerify(jsonRequest(url, { response: assertion }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unknown_credential" });
  });

  it("returns 400 without a ceremony cookie", async () => {
    const res = await postAuthVerify(jsonRequest(url, { response: assertion }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "ceremony_missing" });
    expect(finishPasskeyAuthentication).not.toHaveBeenCalled();
  });

  it("returns 400 when the body carries no response", async () => {
    mockCookieJar({ [WEBAUTHN_CEREMONY_COOKIE_NAME]: CEREMONY_ID });

    const res = await postAuthVerify(jsonRequest(url, {}));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid_body" });
    expect(finishPasskeyAuthentication).not.toHaveBeenCalled();
  });
});
