import { log } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { isWellFormedTrackingToken } from "./tracking-token";
import {
  notifyAdminsOfQuestion,
  type AskAdminNotification,
} from "./ask-admin-notify";

export const ASK_ADMIN_ACTION = "REQUEST_QUESTION";
export const ASK_ADMIN_MESSAGE_MAX_LENGTH = 2000;
/** A tracking link is a public bearer; cap how often it can page the team. */
export const ASK_ADMIN_HOURLY_LIMIT = 5;
const ASK_ADMIN_WINDOW_MS = 60 * 60 * 1000;

export type AskAdminFieldError = "required" | "too_long";

export type AskAdminResult =
  | {
      ok: true;
      question: { id: string; message: string; createdAt: string };
    }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "invalid_message"; field: AskAdminFieldError }
  | { ok: false; error: "rate_limited" };

export interface RequestQuestionView {
  id: string;
  message: string;
  createdAt: string;
}

export interface AdminQuestionView {
  id: string;
  requestId: string;
  requester_name: string;
  service_type: string;
  neighborhood: string;
  message: string;
  createdAt: string;
}

const ADMIN_QUESTION_LIMIT = 50;

export function parseAskAdminMessage(
  value: unknown,
): { ok: true; message: string } | { ok: false; error: AskAdminFieldError } {
  if (typeof value !== "string") return { ok: false, error: "required" };
  const message = value.trim();
  if (message.length === 0) return { ok: false, error: "required" };
  if (message.length > ASK_ADMIN_MESSAGE_MAX_LENGTH) {
    return { ok: false, error: "too_long" };
  }
  return { ok: true, message };
}

/**
 * Records a question from the holder of a tracking link and emails every
 * active admin. The question is kept even when mail fails, so the console
 * still shows it.
 */
export async function askAdmin(
  token: string,
  rawMessage: unknown,
  options: { now?: Date; env?: NodeJS.ProcessEnv } = {},
): Promise<AskAdminResult> {
  if (!isWellFormedTrackingToken(token)) return { ok: false, error: "not_found" };

  const parsed = parseAskAdminMessage(rawMessage);
  if (!parsed.ok) return { ok: false, error: "invalid_message", field: parsed.error };

  const request = await prisma.request.findUnique({
    where: { tracking_token: token },
    select: {
      id: true,
      requester_name: true,
      service_type: true,
      neighborhood: true,
    },
  });
  if (!request) return { ok: false, error: "not_found" };

  const now = options.now ?? new Date();
  const recent = await prisma.requestQuestion.count({
    where: {
      requestId: request.id,
      createdAt: { gte: new Date(now.getTime() - ASK_ADMIN_WINDOW_MS) },
    },
  });
  if (recent >= ASK_ADMIN_HOURLY_LIMIT) return { ok: false, error: "rate_limited" };

  const created = await prisma.requestQuestion.create({
    data: { requestId: request.id, message: parsed.message },
    select: { id: true, message: true, createdAt: true },
  });

  const notification = await notifyAdminsOfQuestion(
    {
      requestId: request.id,
      requesterName: request.requester_name,
      serviceType: request.service_type,
      neighborhood: request.neighborhood,
      message: parsed.message,
    },
    options.env,
  );

  await recordQuestion(request.id, notification);

  return {
    ok: true,
    question: {
      id: created.id,
      message: created.message,
      createdAt: created.createdAt.toISOString(),
    },
  };
}

/** Questions the token holder already sent, newest first. */
export async function listRequestQuestions(
  requestId: string,
): Promise<RequestQuestionView[]> {
  const rows = await prisma.requestQuestion.findMany({
    where: { requestId },
    select: { id: true, message: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: ADMIN_QUESTION_LIMIT,
  });

  return rows.map((row) => ({
    id: row.id,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Recent questions for the admin console. Contact details stay on the request grid. */
export async function listAdminQuestions(
  limit: number = ADMIN_QUESTION_LIMIT,
): Promise<AdminQuestionView[]> {
  const rows = await prisma.requestQuestion.findMany({
    select: {
      id: true,
      message: true,
      createdAt: true,
      request: {
        select: {
          id: true,
          requester_name: true,
          service_type: true,
          neighborhood: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const questions: AdminQuestionView[] = [];
  for (const row of rows) {
    if (!row.request) continue;
    questions.push({
      id: row.id,
      requestId: row.request.id,
      requester_name: row.request.requester_name,
      service_type: row.request.service_type,
      neighborhood: row.request.neighborhood,
      message: row.message,
      createdAt: row.createdAt.toISOString(),
    });
  }
  return questions;
}

async function recordQuestion(
  requestId: string,
  notification: AskAdminNotification,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: null,
        requestId,
        action: ASK_ADMIN_ACTION,
        metadata: { source: "ask_admin", notification },
      },
    });
  } catch (err) {
    log({
      level: "error",
      msg: "ask_admin_audit_failed",
      requestId,
      action: ASK_ADMIN_ACTION,
      error: err instanceof Error && err.message.trim() ? err.message.trim() : "unknown",
    });
  }
}
