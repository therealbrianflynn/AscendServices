/**
 * Register → authenticate against the real `@simplewebauthn/server` verifier
 * and a software authenticator that produces genuine P-256 signatures. Nothing
 * about the WebAuthn verification is stubbed, so a regression in how the app
 * stores or reads a credential fails here rather than in production.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaProxy = vi.hoisted(() => {
  const holder: { current: Record<string | symbol, unknown> | null } = { current: null };
  return {
    holder,
    proxy: new Proxy({}, { get: (_target, property) => holder.current?.[property] }),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaProxy.proxy }));

import {
  finishPasskeyAuthentication,
  startPasskeyAuthentication,
} from "@/lib/auth/webauthn/authentication";
import {
  finishPasskeyRegistration,
  startPasskeyRegistration,
} from "@/lib/auth/webauthn/registration";

import { createFakeAuthPrisma, type FakeAuthPrisma } from "./helpers/fake-auth-prisma";
import { SoftwareAuthenticator, base64url } from "./helpers/software-authenticator";

const ORIGIN = "http://localhost:3000";
const RP_ID = "localhost";

const member = {
  id: "66666666-6666-4666-8666-666666666666",
  name: "Ada Server",
  email: "ada@ascend.test",
  role: "SERVER",
};

const otherMember = {
  id: "77777777-7777-4777-8777-777777777777",
  name: "Boaz Admin",
  email: "boaz@ascend.test",
  role: "ADMIN",
};

let db: FakeAuthPrisma;

function newAuthenticator(userId: string = member.id) {
  return new SoftwareAuthenticator({
    userHandle: base64url(new TextEncoder().encode(userId)),
  });
}

/** Full enrolment: options → authenticator → verify. */
async function enrol(
  authenticator: SoftwareAuthenticator,
  userId: string = member.id,
  label?: string,
) {
  const started = await startPasskeyRegistration(userId);
  if (!started) throw new Error("registration did not start");

  return finishPasskeyRegistration({
    userId,
    ceremonyId: started.ceremonyId,
    response: authenticator.register({
      challenge: started.options.challenge,
      rpId: RP_ID,
      origin: ORIGIN,
    }),
    label,
  });
}

/** Full sign-in: options → authenticator → verify. */
async function signIn(authenticator: SoftwareAuthenticator, email?: string) {
  const started = await startPasskeyAuthentication({ email });

  return finishPasskeyAuthentication({
    ceremonyId: started.ceremonyId,
    response: authenticator.authenticate({
      challenge: started.options.challenge,
      rpId: RP_ID,
      origin: ORIGIN,
    }),
  });
}

/** What the browser actually receives, with `undefined` members dropped. */
function onTheWire<T>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value));
}

beforeEach(() => {
  db = createFakeAuthPrisma([{ ...member }, { ...otherMember }]);
  prismaProxy.holder.current = db.client as Record<string | symbol, unknown>;
  process.env.APP_BASE_URL = ORIGIN;
  delete process.env.WEBAUTHN_RP_ID;
  delete process.env.WEBAUTHN_ORIGINS;
});

afterEach(() => {
  prismaProxy.holder.current = null;
  vi.restoreAllMocks();
});

describe("passkey registration", () => {
  it("stores the credential's public half for the signed-in member", async () => {
    const authenticator = newAuthenticator();

    const result = await enrol(authenticator, member.id, "Work laptop");

    expect(result.ok).toBe(true);
    expect(db.passkeys).toHaveLength(1);
    const [stored] = db.passkeys;
    expect(stored.userId).toBe(member.id);
    expect(stored.credential_id).toBe(authenticator.credentialId);
    expect(stored.public_key.byteLength).toBeGreaterThan(0);
    expect(stored.label).toBe("Work laptop");
    expect(stored.device_type).toBe("singleDevice");
  });

  it("records an audit row carrying device shape but no credential material", async () => {
    await enrol(newAuthenticator());

    const audit = db.auditLogs.find((row) => row.action === "PASSKEY_REGISTERED");
    expect(audit?.actorId).toBe(member.id);
    const metadata = JSON.stringify(audit?.metadata);
    expect(metadata).toContain("deviceType");
    expect(metadata).not.toContain(db.passkeys[0].credential_id);
    expect(metadata).not.toContain("attestation");
    expect(metadata).not.toContain("publicKey");
  });

  it("excludes already-enrolled credentials from a second ceremony", async () => {
    const authenticator = newAuthenticator();
    await enrol(authenticator);

    const started = await startPasskeyRegistration(member.id);

    expect(started?.options.excludeCredentials).toEqual([
      { id: authenticator.credentialId, transports: ["internal"], type: "public-key" },
    ]);
  });

  it("refuses an unknown user", async () => {
    await expect(startPasskeyRegistration("not-a-member")).resolves.toBeNull();
  });

  it("rejects a response signed for a different origin", async () => {
    const authenticator = newAuthenticator();
    const started = await startPasskeyRegistration(member.id);

    const result = await finishPasskeyRegistration({
      userId: member.id,
      ceremonyId: started!.ceremonyId,
      response: authenticator.register({
        challenge: started!.options.challenge,
        rpId: RP_ID,
        origin: "http://evil.test",
      }),
    });

    expect(result).toEqual({ ok: false, reason: "verification_failed" });
    expect(db.passkeys).toHaveLength(0);
  });

  it("rejects a response that answers a different challenge", async () => {
    const authenticator = newAuthenticator();
    const started = await startPasskeyRegistration(member.id);

    const result = await finishPasskeyRegistration({
      userId: member.id,
      ceremonyId: started!.ceremonyId,
      response: authenticator.register({
        challenge: "c29tZS1vdGhlci1jaGFsbGVuZ2U",
        rpId: RP_ID,
        origin: ORIGIN,
      }),
    });

    expect(result).toEqual({ ok: false, reason: "verification_failed" });
    expect(db.passkeys).toHaveLength(0);
  });

  it("refuses to spend another member's enrolment challenge", async () => {
    const started = await startPasskeyRegistration(otherMember.id);

    const result = await finishPasskeyRegistration({
      userId: member.id,
      ceremonyId: started!.ceremonyId,
      response: newAuthenticator().register({
        challenge: started!.options.challenge,
        rpId: RP_ID,
        origin: ORIGIN,
      }),
    });

    expect(result).toEqual({ ok: false, reason: "challenge_invalid" });
    expect(db.passkeys).toHaveLength(0);
  });

  it("rejects a credential already bound to an account", async () => {
    const authenticator = newAuthenticator();
    await enrol(authenticator);

    const result = await enrol(authenticator);

    expect(result).toEqual({ ok: false, reason: "credential_already_registered" });
    expect(db.passkeys).toHaveLength(1);
  });

  it("burns the enrolment challenge so it cannot be replayed", async () => {
    const authenticator = newAuthenticator();
    const started = await startPasskeyRegistration(member.id);
    const response = authenticator.register({
      challenge: started!.options.challenge,
      rpId: RP_ID,
      origin: ORIGIN,
    });

    const first = await finishPasskeyRegistration({
      userId: member.id,
      ceremonyId: started!.ceremonyId,
      response,
    });
    const replay = await finishPasskeyRegistration({
      userId: member.id,
      ceremonyId: started!.ceremonyId,
      response,
    });

    expect(first.ok).toBe(true);
    expect(replay).toEqual({ ok: false, reason: "challenge_consumed" });
    expect(db.passkeys).toHaveLength(1);
  });
});

describe("passkey authentication", () => {
  it("signs in an enrolled member and resolves their role from the database", async () => {
    const authenticator = newAuthenticator();
    await enrol(authenticator);

    const result = await signIn(authenticator);

    expect(result).toEqual({
      ok: true,
      user: {
        id: member.id,
        name: member.name,
        email: member.email,
        role: "SERVER",
      },
    });
  });

  it("signs in an ADMIN with their ADMIN role", async () => {
    const authenticator = newAuthenticator(otherMember.id);
    await enrol(authenticator, otherMember.id);

    const result = await signIn(authenticator, otherMember.email);

    expect(result).toMatchObject({ ok: true, user: { role: "ADMIN" } });
  });

  it("advances the stored signature counter and records the last use", async () => {
    const authenticator = newAuthenticator();
    await enrol(authenticator);

    await signIn(authenticator);

    expect(db.passkeys[0].counter).toBe(1);
    expect(db.passkeys[0].lastUsedAt).toBeInstanceOf(Date);
  });

  it("records a USER_LOGIN audit row naming the passkey method", async () => {
    const authenticator = newAuthenticator();
    await enrol(authenticator);

    await signIn(authenticator);

    expect(db.auditLogs).toContainEqual({
      actorId: member.id,
      action: "USER_LOGIN",
      metadata: { method: "passkey" },
    });
  });

  it("narrows the ceremony to the named member's credentials", async () => {
    const authenticator = newAuthenticator();
    await enrol(authenticator);

    const started = await startPasskeyAuthentication({ email: member.email });

    expect(started.options.allowCredentials).toEqual([
      { id: authenticator.credentialId, transports: ["internal"], type: "public-key" },
    ]);
  });

  it("offers a discoverable ceremony for an unknown email without saying so", async () => {
    await enrol(newAuthenticator());

    // Compared as the browser receives them: an unknown address must produce a
    // payload that is indistinguishable in shape from a blank one.
    const unknown = onTheWire(
      (await startPasskeyAuthentication({ email: "nobody@ascend.test" })).options,
    );
    const blank = onTheWire((await startPasskeyAuthentication()).options);

    expect(unknown.allowCredentials).toBeUndefined();
    expect(Object.keys(unknown).sort()).toEqual(Object.keys(blank).sort());
  });

  it("rejects a credential that was never enrolled", async () => {
    const result = await signIn(newAuthenticator());

    expect(result).toEqual({ ok: false, reason: "unknown_credential" });
  });

  it("rejects an assertion replayed against a spent challenge", async () => {
    const authenticator = newAuthenticator();
    await enrol(authenticator);
    const started = await startPasskeyAuthentication();
    const response = authenticator.authenticate({
      challenge: started.options.challenge,
      rpId: RP_ID,
      origin: ORIGIN,
    });

    const first = await finishPasskeyAuthentication({
      ceremonyId: started.ceremonyId,
      response,
    });
    const replay = await finishPasskeyAuthentication({
      ceremonyId: started.ceremonyId,
      response,
    });

    expect(first.ok).toBe(true);
    expect(replay).toEqual({ ok: false, reason: "challenge_consumed" });
  });

  it("rejects an assertion from a different origin", async () => {
    const authenticator = newAuthenticator();
    await enrol(authenticator);
    const started = await startPasskeyAuthentication();

    const result = await finishPasskeyAuthentication({
      ceremonyId: started.ceremonyId,
      response: authenticator.authenticate({
        challenge: started.options.challenge,
        rpId: RP_ID,
        origin: "http://evil.test",
      }),
    });

    expect(result).toEqual({ ok: false, reason: "verification_failed" });
  });

  it("rejects an assertion whose signature does not match the stored key", async () => {
    const authenticator = newAuthenticator();
    await enrol(authenticator);
    const started = await startPasskeyAuthentication();
    const response = authenticator.authenticate({
      challenge: started.options.challenge,
      rpId: RP_ID,
      origin: ORIGIN,
    });

    const impostor = newAuthenticator();
    const forged = impostor.authenticate({
      challenge: started.options.challenge,
      rpId: RP_ID,
      origin: ORIGIN,
    });

    const result = await finishPasskeyAuthentication({
      ceremonyId: started.ceremonyId,
      response: { ...response, response: { ...response.response, signature: forged.response.signature } },
    });

    expect(result).toEqual({ ok: false, reason: "verification_failed" });
  });

  it("rejects a counter that fails to advance, the signal of a cloned authenticator", async () => {
    const authenticator = newAuthenticator();
    await enrol(authenticator);
    await signIn(authenticator);

    authenticator.rewindSignCount(0);
    const result = await signIn(authenticator);

    expect(result).toEqual({ ok: false, reason: "verification_failed" });
  });

  it("refuses an assertion for a member other than the one who asked", async () => {
    const authenticator = newAuthenticator();
    await enrol(authenticator);
    const started = await startPasskeyAuthentication({ email: otherMember.email });

    const result = await finishPasskeyAuthentication({
      ceremonyId: started.ceremonyId,
      response: authenticator.authenticate({
        challenge: started.options.challenge,
        rpId: RP_ID,
        origin: ORIGIN,
      }),
    });

    expect(result).toEqual({ ok: false, reason: "unknown_credential" });
  });

  it("refuses an assertion whose user handle disagrees with the stored owner", async () => {
    const authenticator = new SoftwareAuthenticator({
      userHandle: base64url(new TextEncoder().encode(otherMember.id)),
    });
    await enrol(authenticator);
    const started = await startPasskeyAuthentication();

    const result = await finishPasskeyAuthentication({
      ceremonyId: started.ceremonyId,
      response: authenticator.authenticate({
        challenge: started.options.challenge,
        rpId: RP_ID,
        origin: ORIGIN,
      }),
    });

    expect(result).toEqual({ ok: false, reason: "verification_failed" });
  });
});

describe("ceremony logging", () => {
  it("never writes a challenge, public key or attestation blob to the log", async () => {
    const written: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line) => void written.push(String(line)));
    vi.spyOn(console, "warn").mockImplementation((line) => void written.push(String(line)));

    const authenticator = newAuthenticator();
    const registration = await startPasskeyRegistration(member.id);
    const attestation = authenticator.register({
      challenge: registration!.options.challenge,
      rpId: RP_ID,
      origin: ORIGIN,
    });
    await finishPasskeyRegistration({
      userId: member.id,
      ceremonyId: registration!.ceremonyId,
      response: attestation,
    });

    const authentication = await startPasskeyAuthentication({ email: member.email });
    const assertion = authenticator.authenticate({
      challenge: authentication.options.challenge,
      rpId: RP_ID,
      origin: ORIGIN,
    });
    await finishPasskeyAuthentication({
      ceremonyId: authentication.ceremonyId,
      response: assertion,
    });
    // A failure path logs too, and must be just as quiet.
    await finishPasskeyAuthentication({
      ceremonyId: authentication.ceremonyId,
      response: assertion,
    });

    expect(written.length).toBeGreaterThan(0);
    const output = written.join("\n");
    for (const secret of [
      registration!.options.challenge,
      authentication.options.challenge,
      attestation.response.attestationObject,
      assertion.response.signature,
      assertion.response.authenticatorData,
      authenticator.credentialId,
      Buffer.from(db.passkeys[0].public_key).toString("base64url"),
    ]) {
      expect(output).not.toContain(secret);
    }
  });
});
