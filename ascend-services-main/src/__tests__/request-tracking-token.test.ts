import { describe, expect, it } from "vitest";

import {
  buildTrackingPath,
  buildTrackingUrl,
  createTrackingToken,
  isWellFormedTrackingToken,
} from "@/lib/requests/tracking-token";

describe("tracking tokens", () => {
  it("mints url-safe tokens with at least 128 bits of entropy", () => {
    const token = createTrackingToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    // base64url packs 6 bits per character.
    expect(token.length * 6).toBeGreaterThanOrEqual(128);
  });

  it("never repeats a token across many mints", () => {
    const tokens = new Set(Array.from({ length: 2_000 }, createTrackingToken));
    expect(tokens.size).toBe(2_000);
  });

  it("builds the portal path and absolute url", () => {
    expect(buildTrackingPath("abc123")).toBe("/track/abc123");
    expect(buildTrackingUrl("abc123", "http://localhost:3000")).toBe(
      "http://localhost:3000/track/abc123",
    );
  });

  it("recognises generated tokens and the database uuid backstop", () => {
    expect(isWellFormedTrackingToken(createTrackingToken())).toBe(true);
    expect(isWellFormedTrackingToken("3f1c2a8e-4a1b-4f0d-9c3e-1d2b3a4c5d6e")).toBe(true);
  });

  it("rejects junk before it reaches the database", () => {
    expect(isWellFormedTrackingToken("")).toBe(false);
    expect(isWellFormedTrackingToken("short")).toBe(false);
    expect(isWellFormedTrackingToken("../../etc/passwd")).toBe(false);
    expect(isWellFormedTrackingToken("x".repeat(129))).toBe(false);
    expect(isWellFormedTrackingToken(undefined)).toBe(false);
  });
});
