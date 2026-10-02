import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  buildMagicLinkUrl,
  createMagicLinkToken,
  hashMagicLinkToken,
} from "@/lib/auth/tokens";

describe("magic link tokens", () => {
  it("issues url-safe tokens with at least 128 bits of entropy", () => {
    const token = createMagicLinkToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, "base64url").byteLength).toBeGreaterThanOrEqual(32);
  });

  it("never issues the same token twice", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => createMagicLinkToken()));
    expect(tokens.size).toBe(200);
  });

  it("hashes tokens deterministically with SHA-256 so raw tokens are never stored", () => {
    const token = createMagicLinkToken();
    const expected = createHash("sha256").update(token).digest("hex");
    expect(hashMagicLinkToken(token)).toBe(expected);
    expect(hashMagicLinkToken(token)).toBe(hashMagicLinkToken(token));
    expect(hashMagicLinkToken(token)).not.toContain(token);
  });

  it("builds an absolute callback url carrying the token", () => {
    const url = buildMagicLinkUrl("abc123", "http://localhost:3000");
    expect(url).toBe("http://localhost:3000/api/auth/callback?token=abc123");
  });

  it("tolerates a trailing slash on the base url", () => {
    expect(buildMagicLinkUrl("abc", "http://localhost:3000/")).toBe(
      "http://localhost:3000/api/auth/callback?token=abc",
    );
  });
});
