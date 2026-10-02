import { getEmailTransport } from "@/lib/email";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { AUTH_USER_SELECT as USER_SELECT, toAuthUser, type AuthUser } from "./auth-user";
import { getAuthConfig } from "./config";
import { displayNameFor, normalizeEmail } from "./email-address";
import { SERVER_ROLE } from "./roles";
import { buildMagicLinkUrl, createMagicLinkToken, hashMagicLinkToken } from "./tokens";

export { InvalidEmailError } from "./email-address";
export type { AuthUser };

const MAGIC_LINK_SUBJECT = "Your Ascend Services sign-in link";
const MAGIC_LINK_TEMPLATE = "magic_link";

export interface RequestMagicLinkInput {
  email: string;
  name?: string;
}

export interface RequestMagicLinkResult {
  user: AuthUser;
  /** Raw token; only ever handed to the email transport, never persisted. */
  token: string;
  expiresAt: Date;
  /** True when this request also created the user record. */
  created: boolean;
}

export type MagicLinkRejection = "invalid" | "expired" | "consumed";

export type ConsumeMagicLinkResult =
  | { ok: true; user: AuthUser }
  | { ok: false; reason: MagicLinkRejection };

/**
 * Issues a single-use sign-in link. Unknown emails self-register as SERVER;
 * ADMIN is never granted here (see `scripts/seed-admin.ts`).
 */
export async function requestMagicLink({
  email,
  name,
}: RequestMagicLinkInput): Promise<RequestMagicLinkResult> {
  const normalizedEmail = normalizeEmail(email);
  const config = getAuthConfig();

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: USER_SELECT,
  });

  const record =
    existing ??
    (await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: displayNameFor(name, normalizedEmail),
        role: SERVER_ROLE,
      },
      select: USER_SELECT,
    }));

  const user = toAuthUser(record);
  const token = createMagicLinkToken();
  const expiresAt = new Date(Date.now() + config.magicLinkTtlMinutes * 60_000);

  await prisma.magicLinkToken.create({
    data: {
      token_hash: hashMagicLinkToken(token),
      userId: user.id,
      expiresAt,
    },
  });

  const sent = await getEmailTransport().send({
    to: user.email,
    subject: MAGIC_LINK_SUBJECT,
    template: MAGIC_LINK_TEMPLATE,
    text: renderMagicLinkEmail({
      name: user.name,
      url: buildMagicLinkUrl(token, config.appBaseUrl),
      ttlMinutes: config.magicLinkTtlMinutes,
    }),
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "MAGIC_LINK_REQUESTED",
      metadata: {
        transport: sent.transport,
        messageId: sent.messageId,
        newUser: existing === null,
        expiresAt: expiresAt.toISOString(),
      },
    },
  });

  log({
    msg: "magic_link_issued",
    action: "MAGIC_LINK_REQUESTED",
    actorId: user.id,
    newUser: existing === null,
    expiresAt: expiresAt.toISOString(),
    messageId: sent.messageId,
  });

  return { user, token, expiresAt, created: existing === null };
}

/**
 * Redeems a magic-link token exactly once. Expiry is checked before the burn,
 * and the burn itself is a conditional update so two concurrent clicks cannot
 * both succeed.
 */
export async function consumeMagicLink(
  rawToken: string,
): Promise<ConsumeMagicLinkResult> {
  const token = typeof rawToken === "string" ? rawToken.trim() : "";
  if (token.length === 0) return reject("invalid");

  const record = await prisma.magicLinkToken.findUnique({
    where: { token_hash: hashMagicLinkToken(token) },
    include: { user: { select: USER_SELECT } },
  });

  if (!record) return reject("invalid");
  if (record.consumedAt) return reject("consumed", record.userId);

  const now = new Date();
  if (record.expiresAt.getTime() <= now.getTime()) return reject("expired", record.userId);

  const burned = await prisma.magicLinkToken.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: now },
  });
  if (burned.count === 0) return reject("consumed", record.userId);

  const user = toAuthUser(record.user);

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "USER_LOGIN",
      metadata: { method: MAGIC_LINK_TEMPLATE },
    },
  });

  log({
    msg: "magic_link_consumed",
    action: "USER_LOGIN",
    actorId: user.id,
  });

  return { ok: true, user };
}

function reject(reason: MagicLinkRejection, actorId?: string): ConsumeMagicLinkResult {
  log({
    level: "warn",
    msg: "magic_link_rejected",
    action: "MAGIC_LINK_REJECTED",
    reason,
    ...(actorId ? { actorId } : {}),
  });
  return { ok: false, reason };
}

function renderMagicLinkEmail({
  name,
  url,
  ttlMinutes,
}: {
  name: string;
  url: string;
  ttlMinutes: number;
}): string {
  return [
    `Hi ${name},`,
    "",
    "Use the link below to sign in to Ascend Services. It works once and then expires.",
    "",
    url,
    "",
    `This link expires in ${ttlMinutes} minutes. If you did not request it, you can ignore this email.`,
  ].join("\n");
}
