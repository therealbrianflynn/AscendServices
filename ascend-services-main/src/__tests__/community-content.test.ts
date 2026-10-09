import { describe, expect, it } from "vitest";

import { parseCommunityEvent, parsePartner, youtubeEmbedUrl } from "@/lib/community/content";
import { parseServeApplication } from "@/lib/serve/application";

const SERVICES = ["Meals", "Yard work"];

describe("parseServeApplication", () => {
  it("accepts a complete application", () => {
    const parsed = parseServeApplication(
      { name: "Ada", email: "Ada@Example.com", services: ["Meals"], bio: "I can cook." },
      SERVICES,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.email).toBe("ada@example.com");
    expect(parsed.value.services).toEqual(["Meals"]);
  });

  it("rejects a missing name and an unknown service", () => {
    const parsed = parseServeApplication(
      { name: "  ", email: "ada@example.com", services: ["Flying"] },
      SERVICES,
    );
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.fields.name).toBe("required");
    expect(parsed.fields.services).toBe("unsupported");
  });
});

describe("parseCommunityEvent", () => {
  it("rejects an end time that comes before the start", () => {
    const parsed = parseCommunityEvent({
      title: "Meal packing",
      startsAt: "2026-11-02T15:00:00.000Z",
      endsAt: "2026-11-02T14:00:00.000Z",
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.fields.endsAt).toBe("invalid");
  });

  it("requires https for an optional link", () => {
    const parsed = parseCommunityEvent({
      title: "Meal packing",
      startsAt: "2026-11-02T15:00:00.000Z",
      link: "http://example.com",
    });
    expect(parsed.ok).toBe(false);
  });
});

describe("parsePartner", () => {
  it("requires a name, summary, and https website", () => {
    const parsed = parsePartner({ name: "Life Church", summary: "", website: "notaurl" });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.fields.summary).toBe("required");
    expect(parsed.fields.website).toBe("invalid");
  });
});

describe("youtubeEmbedUrl", () => {
  it("turns a watch link into an embed", () => {
    expect(youtubeEmbedUrl("https://www.youtube.com/watch?v=abc123")).toBe(
      "https://www.youtube.com/embed/abc123",
    );
  });
});
