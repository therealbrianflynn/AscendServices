import { describe, expect, it } from "vitest";

import { safeNextPath } from "@/lib/auth/return-path";
import { serveStep } from "@/lib/serve/access";

describe("safeNextPath", () => {
  it("keeps a same-site path", () => {
    expect(safeNextPath("/serve")).toBe("/serve");
    expect(safeNextPath("/serve?pending=1")).toBe("/serve?pending=1");
  });

  it("rejects off-site and protocol-relative targets", () => {
    expect(safeNextPath("https://evil.example/serve")).toBeNull();
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("/\\evil.example")).toBeNull();
    expect(safeNextPath("")).toBeNull();
    expect(safeNextPath(null)).toBeNull();
  });
});

describe("serveStep", () => {
  it("asks a visitor to sign in before they can offer to serve", () => {
    expect(serveStep({ signedIn: false, passkeyCount: 0 })).toBe("sign-in");
  });

  it("requires a passkey even when a session already exists", () => {
    expect(serveStep({ signedIn: true, passkeyCount: 0 })).toBe("passkey");
    expect(serveStep({ signedIn: true, passkeyCount: 1.5 })).toBe("passkey");
  });

  it("opens the offer once the signed-in member has a passkey", () => {
    expect(serveStep({ signedIn: true, passkeyCount: 1 })).toBe("offer");
  });
});
