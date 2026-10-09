import { describe, expect, it } from "vitest";

import { canOpenHelpBoard } from "@/lib/auth/board-access";

describe("canOpenHelpBoard", () => {
  it("lets an admin open the board without a validation stamp", () => {
    expect(canOpenHelpBoard({ role: "ADMIN", validatedAt: null })).toBe(true);
  });

  it("lets a validated server open the board", () => {
    expect(
      canOpenHelpBoard({ role: "SERVER", validatedAt: new Date("2026-10-01T00:00:00.000Z") }),
    ).toBe(true);
  });

  it("keeps an unvalidated server off the board", () => {
    expect(canOpenHelpBoard({ role: "SERVER", validatedAt: null })).toBe(false);
  });
});
