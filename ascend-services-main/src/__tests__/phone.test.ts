import { describe, expect, it } from "vitest";

import { parseOptionalPhone } from "@/lib/phone";

describe("parseOptionalPhone", () => {
  it("keeps a readable number and treats a blank as none", () => {
    expect(parseOptionalPhone(" (317) 555-0100 ")).toEqual({
      ok: true,
      phone: "(317) 555-0100",
    });
    expect(parseOptionalPhone("")).toEqual({ ok: true, phone: null });
    expect(parseOptionalPhone(null)).toEqual({ ok: true, phone: null });
  });

  it("rejects a number that is too short or not a phone", () => {
    expect(parseOptionalPhone("123")).toEqual({ ok: false, reason: "invalid" });
    expect(parseOptionalPhone("call me")).toEqual({ ok: false, reason: "invalid" });
    expect(parseOptionalPhone("1".repeat(21))).toEqual({ ok: false, reason: "too_long" });
  });
});
