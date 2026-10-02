import { log } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import type { HelpRequestInput } from "./input";
import { NEW_STATUS, type RequestStatus } from "./status";
import { createTrackingToken } from "./tracking-token";
import {
  PUBLIC_REQUEST_SELECT,
  TRACKING_REQUEST_SELECT,
  toPublicRequestView,
  toTrackingRequestView,
  type PublicRequestView,
  type TrackingRequestView,
} from "./views";

export const REQUEST_CREATED_ACTION = "REQUEST_CREATED";

/** Public form submissions have no signed-in actor; the audit row records why. */
const PUBLIC_FORM_SOURCE = "public_request_form";

/**
 * Unique tracking tokens carry 192 bits of entropy, so a collision is a
 * theoretical event rather than an expected one — but a requester in need must
 * not see a 500 because of it.
 */
const TOKEN_COLLISION_RETRIES = 2;

const UNIQUE_CONSTRAINT_ERROR = "P2002";

/** Newest first; the seed board stays small until Feature 2 adds filtering. */
const PUBLIC_BOARD_LIMIT = 50;

export interface CreatedHelpRequest {
  id: string;
  tracking_token: string;
  status: RequestStatus;
  createdAt: string;
}

/**
 * Creates a help request and its audit trail in one transaction: an
 * un-audited request would be invisible to the accountability story in
 * Spec v6 §3, so the two rows live or die together.
 */
export async function createHelpRequest(
  input: HelpRequestInput,
): Promise<CreatedHelpRequest> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await insertHelpRequest(input);
    } catch (err) {
      if (attempt >= TOKEN_COLLISION_RETRIES || !isTrackingTokenCollision(err)) {
        throw err;
      }
      log({
        level: "warn",
        msg: "tracking_token_collision_retry",
        action: REQUEST_CREATED_ACTION,
        attempt: attempt + 1,
      });
    }
  }
}

async function insertHelpRequest(
  input: HelpRequestInput,
): Promise<CreatedHelpRequest> {
  const tracking_token = createTrackingToken();

  const created = await prisma.$transaction(async (tx) => {
    const request = await tx.request.create({
      data: { ...input, status: NEW_STATUS, tracking_token },
      select: { id: true, status: true, createdAt: true },
    });

    await tx.auditLog.create({
      data: {
        actorId: null,
        requestId: request.id,
        action: REQUEST_CREATED_ACTION,
        fromStatus: null,
        toStatus: request.status,
        // Public-facing facts only: no name, address, prayer text or token.
        metadata: {
          source: PUBLIC_FORM_SOURCE,
          service_type: input.service_type,
          neighborhood: input.neighborhood,
          has_prayer_request: input.prayer_request !== null,
          prayer_private: input.prayer_private,
        },
      },
    });

    return request;
  });

  log({
    msg: "help_request_created",
    action: REQUEST_CREATED_ACTION,
    requestId: created.id,
    status: created.status,
    service_type: input.service_type,
    neighborhood: input.neighborhood,
  });

  return {
    id: created.id,
    tracking_token,
    status: created.status as RequestStatus,
    createdAt: created.createdAt.toISOString(),
  };
}

/**
 * Self-service portal lookup. The token is the only credential, so a miss is
 * reported as "not found" without revealing whether the token ever existed.
 */
export async function findRequestByTrackingToken(
  tracking_token: string,
): Promise<TrackingRequestView | null> {
  const record = await prisma.request.findUnique({
    where: { tracking_token },
    select: TRACKING_REQUEST_SELECT,
  });

  return record ? toTrackingRequestView(record) : null;
}

/**
 * Unauthenticated board feed. Selects the public columns only, so
 * `street_address` never leaves the database on this path.
 */
export async function listPublicRequests(
  limit: number = PUBLIC_BOARD_LIMIT,
): Promise<PublicRequestView[]> {
  const records = await prisma.request.findMany({
    where: { status: NEW_STATUS },
    select: PUBLIC_REQUEST_SELECT,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return records.map(toPublicRequestView);
}

function isTrackingTokenCollision(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const { code, meta } = err as { code?: unknown; meta?: { target?: unknown } };
  if (code !== UNIQUE_CONSTRAINT_ERROR) return false;
  const target = meta?.target;
  return Array.isArray(target)
    ? target.includes("tracking_token")
    : target === "tracking_token";
}
