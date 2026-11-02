import { describe, expect, it } from "vitest";

import { isSafeMediaFilename } from "@/lib/media/filenames";

describe("isSafeMediaFilename", () => {
  it("accepts a generated video basename", () => {
    expect(isSafeMediaFilename("11111111-1111-4111-8111-111111111111.mp4")).toBe(true);
    expect(isSafeMediaFilename("clip.webm")).toBe(true);
    expect(isSafeMediaFilename("clip.mov")).toBe(true);
  });

  it("rejects path traversal and unexpected types", () => {
    expect(isSafeMediaFilename("../secrets.env")).toBe(false);
    expect(isSafeMediaFilename("..\\secrets.env")).toBe(false);
    expect(isSafeMediaFilename("folder/clip.mp4")).toBe(false);
    expect(isSafeMediaFilename("clip.exe")).toBe(false);
    expect(isSafeMediaFilename("")).toBe(false);
  });
});
