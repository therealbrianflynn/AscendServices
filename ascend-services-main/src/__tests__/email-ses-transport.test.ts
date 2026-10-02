import { SendEmailCommand } from "@aws-sdk/client-sesv2";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ log: vi.fn() }));

import { log } from "@/lib/logger";
import { EmailDeliveryError } from "@/lib/email/errors";
import { getEmailTransport } from "@/lib/email";
import { createSesMailer, type SesCommandClient } from "@/lib/email/ses-client";
import { createSesEmailTransport, type SesMailer } from "@/lib/email/ses-transport";

const message = {
  to: "ada@ascend.test",
  subject: "Your Ascend Services sign-in link",
  template: "magic_link",
  text: "Sign in: https://ascendservicesministry.org/api/auth/callback?token=raw-token",
  bcc: ["ops@ascend.test"],
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SES email transport", () => {
  it("sends the message and records the SES message id without the body", async () => {
    const mailer: SesMailer = {
      send: vi.fn(async () => "ses-message-1"),
    };

    const sent = await createSesEmailTransport({
      from: "no-reply@ascendservicesministry.org",
      mailer,
    }).send(message);

    expect(mailer.send).toHaveBeenCalledWith({
      from: "no-reply@ascendservicesministry.org",
      to: message.to,
      bcc: ["ops@ascend.test"],
      subject: message.subject,
      text: message.text,
    });
    expect(sent).toEqual({ transport: "ses", messageId: "ses-message-1" });
    const fields = vi.mocked(log).mock.calls[0][0];
    expect(fields).toMatchObject({
      msg: "email_sent",
      transport: "ses",
      messageId: "ses-message-1",
      to: message.to,
    });
    expect(JSON.stringify(fields)).not.toContain("raw-token");
  });

  it("omits bcc when none is provided", async () => {
    const mailer: SesMailer = { send: vi.fn(async () => "ses-message-2") };

    await createSesEmailTransport({
      from: "no-reply@ascendservicesministry.org",
      mailer,
    }).send({ ...message, bcc: undefined });

    expect(mailer.send).toHaveBeenCalledWith(
      expect.not.objectContaining({ bcc: expect.anything() }),
    );
  });

  it("rejects a send that returns no message id", async () => {
    const mailer: SesMailer = { send: vi.fn(async () => "   ") };

    await expect(
      createSesEmailTransport({
        from: "no-reply@ascendservicesministry.org",
        mailer,
      }).send(message),
    ).rejects.toBeInstanceOf(EmailDeliveryError);
  });

  it("wraps provider failures without including the message body", async () => {
    const mailer: SesMailer = {
      send: vi.fn(async () => {
        throw new Error("Email address is not verified");
      }),
    };

    await expect(
      createSesEmailTransport({
        from: "no-reply@ascendservicesministry.org",
        mailer,
      }).send(message),
    ).rejects.toThrow(/not verified/);
    expect(JSON.stringify(vi.mocked(log).mock.calls)).not.toContain("raw-token");
  });
});

describe("SES client adapter", () => {
  it("maps a message onto SendEmailCommand and returns MessageId", async () => {
    const client: SesCommandClient = {
      send: vi.fn(async () => ({ MessageId: "aws-id-9", $metadata: {} })),
    };

    const messageId = await createSesMailer(client).send({
      from: "no-reply@ascendservicesministry.org",
      to: "ada@ascend.test",
      bcc: ["ops@ascend.test"],
      subject: "Hello",
      text: "Body",
    });

    expect(messageId).toBe("aws-id-9");
    const command = vi.mocked(client.send).mock.calls[0][0];
    expect(command).toBeInstanceOf(SendEmailCommand);
    expect(command.input).toMatchObject({
      FromEmailAddress: "no-reply@ascendservicesministry.org",
      Destination: {
        ToAddresses: ["ada@ascend.test"],
        BccAddresses: ["ops@ascend.test"],
      },
      Content: {
        Simple: {
          Subject: { Data: "Hello", Charset: "UTF-8" },
          Body: { Text: { Data: "Body", Charset: "UTF-8" } },
        },
      },
    });
  });

  it("fails when SES returns an empty message id", async () => {
    const client: SesCommandClient = {
      send: vi.fn(async () => ({ $metadata: {} })),
    };

    await expect(
      createSesMailer(client).send({
        from: "no-reply@ascendservicesministry.org",
        to: "ada@ascend.test",
        subject: "Hello",
        text: "Body",
      }),
    ).rejects.toThrow(/message id/);
  });
});

describe("getEmailTransport ses selection", () => {
  it("requires a from address and region before building the SES client", () => {
    expect(() =>
      getEmailTransport({
        EMAIL_TRANSPORT: "ses",
        EMAIL_FROM: "no-reply@ascendservicesministry.org",
      } as NodeJS.ProcessEnv),
    ).toThrow(/AWS_REGION/);

    expect(() =>
      getEmailTransport({
        EMAIL_TRANSPORT: "ses",
        AWS_REGION: "us-east-1",
      } as NodeJS.ProcessEnv),
    ).toThrow(/EMAIL_FROM/);
  });

  it("builds an SES transport when region and from are set", () => {
    const transport = getEmailTransport({
      EMAIL_TRANSPORT: "ses",
      EMAIL_FROM: "no-reply@ascendservicesministry.org",
      AWS_REGION: "us-east-1",
    } as NodeJS.ProcessEnv);

    expect(transport.send).toEqual(expect.any(Function));
  });
});
