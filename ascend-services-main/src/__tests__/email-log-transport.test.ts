import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ log: vi.fn() }));

import { log } from "@/lib/logger";
import { getEmailTransport } from "@/lib/email";

const message = {
  to: "ada@ascend.test",
  subject: "Your Ascend Services sign-in link",
  template: "magic_link",
  text: "Sign in: http://localhost:3000/api/auth/callback?token=raw-token",
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.EMAIL_TRANSPORT = "log";
  process.env.EMAIL_FROM = "no-reply@ascend.test";
  delete process.env.EMAIL_LOG_INCLUDE_BODY;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("log email transport", () => {
  it("writes one structured log line per outbound email", async () => {
    const sent = await getEmailTransport().send(message);

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "email_sent",
        transport: "log",
        template: "magic_link",
        to: message.to,
        subject: message.subject,
        from: "no-reply@ascend.test",
        messageId: sent.messageId,
      }),
    );
    expect(sent.transport).toBe("log");
    expect(sent.messageId).toMatch(/\S/);
  });

  it("includes the body outside production so developers can follow the link", async () => {
    vi.stubEnv("NODE_ENV", "development");

    await getEmailTransport().send(message);

    expect(vi.mocked(log).mock.calls[0][0].body).toBe(message.text);
  });

  it("omits the body in production so link tokens never reach the logs", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await getEmailTransport().send(message);

    const fields = vi.mocked(log).mock.calls[0][0];
    expect(fields.body).toBeUndefined();
    expect(JSON.stringify(fields)).not.toContain("raw-token");
  });

  it("fails fast on an unknown transport rather than silently dropping mail", () => {
    process.env.EMAIL_TRANSPORT = "sendgrid";
    expect(() => getEmailTransport()).toThrow(/EMAIL_TRANSPORT/);
  });
});
