import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendEmail = vi.hoisted(() => vi.fn());

const prismaProxy = vi.hoisted(() => {
  const holder: { current: Record<string | symbol, unknown> | null } = { current: null };
  return {
    holder,
    proxy: new Proxy(
      {},
      {
        get: (_target, property) => holder.current?.[property],
      },
    ),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaProxy.proxy }));
vi.mock("@/lib/logger", () => ({ log: vi.fn() }));
vi.mock("@/lib/email", () => ({
  getEmailTransport: () => ({ send: sendEmail }),
}));

import { POST as postQuestion } from "@/app/api/requests/track/[token]/questions/route";
import { log } from "@/lib/logger";
import {
  ASK_ADMIN_ACTION,
  ASK_ADMIN_HOURLY_LIMIT,
  askAdmin,
  listAdminQuestions,
  parseAskAdminMessage,
} from "@/lib/requests/ask-admin";
import { renderAskAdminEmail } from "@/lib/requests/ask-admin-notify";

import { createFakePrisma, type FakeMemberRow, type FakePrisma } from "./helpers/fake-prisma";

const TOKEN = "trackingtokenvalue1";
const STREET = "412 Harvest Lane";
const PHONE = "317-555-0199";

function admin(email: string, extra: Partial<FakeMemberRow> = {}): FakeMemberRow {
  return {
    id: email,
    name: email,
    email,
    role: "ADMIN",
    services_provided: [],
    bio: null,
    deactivatedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...extra,
  };
}

let db: FakePrisma;

beforeEach(async () => {
  sendEmail.mockReset();
  sendEmail.mockResolvedValue({ transport: "log", messageId: "msg-1" });
  db = createFakePrisma([
    admin("ada@ministry.test"),
    admin("dee@ministry.test", { createdAt: new Date("2026-01-02T00:00:00Z") }),
    admin("gone@ministry.test", { deactivatedAt: new Date("2026-02-01T00:00:00Z") }),
  ]);
  prismaProxy.holder.current = db.client as Record<string, unknown>;
  const client = db.client as {
    request: {
      create: (input: { data: Record<string, string | null> }) => Promise<unknown>;
    };
  };
  await client.request.create({
    data: {
      requester_name: "Ruth Boaz",
      requester_email: "ruth@example.com",
      requester_phone: PHONE,
      service_type: "Yard work",
      neighborhood: "Eastside",
      street_address: STREET,
      tracking_token: TOKEN,
    },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("parseAskAdminMessage", () => {
  it("trims a usable question", () => {
    expect(parseAskAdminMessage("  When will someone call?  ")).toEqual({
      ok: true,
      message: "When will someone call?",
    });
  });

  it("rejects a blank question", () => {
    expect(parseAskAdminMessage("   ")).toEqual({ ok: false, error: "required" });
    expect(parseAskAdminMessage(null)).toEqual({ ok: false, error: "required" });
  });

  it("rejects a question past the storage limit", () => {
    expect(parseAskAdminMessage("a".repeat(2001))).toEqual({ ok: false, error: "too_long" });
  });
});

describe("askAdmin", () => {
  it("saves the question, audits it, and emails every active admin", async () => {
    const result = await askAdmin(TOKEN, "Has anyone been matched yet?");

    expect(result.ok).toBe(true);
    expect(db.requestQuestions).toHaveLength(1);
    expect(db.requestQuestions[0]?.message).toBe("Has anyone been matched yet?");
    expect(db.auditLogs).toEqual([
      expect.objectContaining({
        action: ASK_ADMIN_ACTION,
        requestId: db.requests[0]?.id,
        metadata: { source: "ask_admin", notification: "sent" },
      }),
    ]);
    expect(sendEmail).toHaveBeenCalledTimes(2);
    const text = sendEmail.mock.calls[0]?.[0].text as string;
    expect(text).toContain("Has anyone been matched yet?");
    expect(text).toContain("Ruth Boaz");
    expect(text).not.toContain(STREET);
    expect(text).not.toContain(PHONE);
    expect(text).not.toContain(TOKEN);
    expect(JSON.stringify((log as ReturnType<typeof vi.fn>).mock.calls)).not.toContain(
      "Has anyone been matched yet?",
    );
  });

  it("keeps the question when one admin address is rejected", async () => {
    sendEmail.mockImplementation(async ({ to }: { to: string }) => {
      if (to === "dee@ministry.test") throw new Error("not verified");
      return { transport: "log", messageId: "msg-2" };
    });

    const result = await askAdmin(TOKEN, "Can I change the day?");

    expect(result.ok).toBe(true);
    expect(db.requestQuestions).toHaveLength(1);
    expect(db.auditLogs[0]?.metadata).toMatchObject({ notification: "partial" });
  });

  it("keeps the question when email cannot be sent", async () => {
    sendEmail.mockRejectedValue(new Error("sandbox"));

    const result = await askAdmin(TOKEN, "Please call me.");

    expect(result.ok).toBe(true);
    expect(db.requestQuestions).toHaveLength(1);
    expect(db.auditLogs[0]?.metadata).toMatchObject({ notification: "failed" });
  });

  it("stops after the hourly limit without emailing again", async () => {
    for (let index = 0; index < ASK_ADMIN_HOURLY_LIMIT; index += 1) {
      const saved = await askAdmin(TOKEN, `Question ${index}`);
      expect(saved.ok).toBe(true);
    }

    const blocked = await askAdmin(TOKEN, "One more");

    expect(blocked).toEqual({ ok: false, error: "rate_limited" });
    expect(db.requestQuestions).toHaveLength(ASK_ADMIN_HOURLY_LIMIT);
    expect(sendEmail).toHaveBeenCalledTimes(ASK_ADMIN_HOURLY_LIMIT * 2);
  });

  it("answers not found for an unknown token and stores nothing", async () => {
    const result = await askAdmin("unknown-token-value", "Hello");

    expect(result).toEqual({ ok: false, error: "not_found" });
    expect(db.requestQuestions).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("lists the question for admins without the street address or phone", async () => {
    await askAdmin(TOKEN, "Who is coming?");

    const questions = await listAdminQuestions();

    expect(questions).toEqual([
      expect.objectContaining({
        requester_name: "Ruth Boaz",
        service_type: "Yard work",
        neighborhood: "Eastside",
        message: "Who is coming?",
      }),
    ]);
    expect(questions[0]).not.toHaveProperty("street_address");
    expect(questions[0]).not.toHaveProperty("requester_phone");
  });
});

describe("renderAskAdminEmail", () => {
  it("names the request and leaves contact details out", () => {
    const text = renderAskAdminEmail({
      requestId: "req-1",
      requesterName: "Ruth Boaz",
      serviceType: "Yard work",
      neighborhood: "Eastside",
      message: "When will someone call?",
    });

    expect(text).toContain("Request req-1");
    expect(text).toContain("When will someone call?");
    expect(text).not.toContain("412 Harvest Lane");
    expect(text).not.toContain("@");
  });
});

describe("POST /api/requests/track/[token]/questions", () => {
  it("returns the saved question", async () => {
    const response = await postQuestion(
      new Request(`http://localhost:3000/api/requests/track/${TOKEN}/questions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Can you help me find the link?" }),
      }),
      { params: Promise.resolve({ token: TOKEN }) },
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.question.message).toBe("Can you help me find the link?");
  });

  it("rejects a body that is not JSON", async () => {
    const response = await postQuestion(
      new Request(`http://localhost:3000/api/requests/track/${TOKEN}/questions`, {
        method: "POST",
        body: "not json",
      }),
      { params: Promise.resolve({ token: TOKEN }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_body" });
  });
});
