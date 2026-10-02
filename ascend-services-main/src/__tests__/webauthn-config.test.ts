import { describe, expect, it } from "vitest";

import { WebAuthnConfigError, getWebAuthnConfig } from "@/lib/auth/webauthn/config";

function env(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", APP_BASE_URL: "http://localhost:3000", ...overrides };
}

describe("getWebAuthnConfig", () => {
  it("derives the RP ID and origin from APP_BASE_URL", () => {
    const config = getWebAuthnConfig(env());

    expect(config.rpId).toBe("localhost");
    expect(config.origins).toEqual(["http://localhost:3000"]);
    expect(config.rpName).toBe("Ascend Services");
    expect(config.challengeTtlMinutes).toBe(5);
  });

  it("accepts an explicit RP ID that is a parent of the origin", () => {
    const config = getWebAuthnConfig(
      env({
        APP_BASE_URL: "https://app.ascend.example",
        WEBAUTHN_RP_ID: "ascend.example",
      }),
    );

    expect(config.rpId).toBe("ascend.example");
    expect(config.origins).toEqual(["https://app.ascend.example"]);
  });

  it("allows several origins for one RP ID", () => {
    const config = getWebAuthnConfig(
      env({
        APP_BASE_URL: "https://ascend.example",
        WEBAUTHN_ORIGINS: "https://ascend.example, https://www.ascend.example",
      }),
    );

    expect(config.origins).toEqual([
      "https://ascend.example",
      "https://www.ascend.example",
    ]);
  });

  it("rejects an origin the RP ID could never cover", () => {
    expect(() =>
      getWebAuthnConfig(
        env({ APP_BASE_URL: "https://ascend.example", WEBAUTHN_RP_ID: "other.example" }),
      ),
    ).toThrow(WebAuthnConfigError);
  });

  it("rejects a look-alike domain that merely ends with the RP ID", () => {
    expect(() =>
      getWebAuthnConfig(
        env({
          APP_BASE_URL: "https://evilascend.example",
          WEBAUTHN_RP_ID: "ascend.example",
        }),
      ),
    ).toThrow(WebAuthnConfigError);
  });

  it("rejects an RP ID that carries a scheme or port", () => {
    expect(() =>
      getWebAuthnConfig(env({ WEBAUTHN_RP_ID: "https://localhost" })),
    ).toThrow(WebAuthnConfigError);
    expect(() => getWebAuthnConfig(env({ WEBAUTHN_RP_ID: "localhost:3000" }))).toThrow(
      WebAuthnConfigError,
    );
  });

  it("rejects an origin that is not an absolute URL", () => {
    expect(() => getWebAuthnConfig(env({ WEBAUTHN_ORIGINS: "localhost:3000" }))).toThrow(
      WebAuthnConfigError,
    );
  });

  it("rejects a non-positive challenge TTL", () => {
    expect(() =>
      getWebAuthnConfig(env({ WEBAUTHN_CHALLENGE_TTL_MINUTES: "0" })),
    ).toThrow(WebAuthnConfigError);
    expect(() =>
      getWebAuthnConfig(env({ WEBAUTHN_CHALLENGE_TTL_MINUTES: "soon" })),
    ).toThrow(WebAuthnConfigError);
  });

  it("uses a configured RP name and TTL", () => {
    const config = getWebAuthnConfig(
      env({ WEBAUTHN_RP_NAME: "Ascend Ministry", WEBAUTHN_CHALLENGE_TTL_MINUTES: "2" }),
    );

    expect(config.rpName).toBe("Ascend Ministry");
    expect(config.challengeTtlMinutes).toBe(2);
  });
});
