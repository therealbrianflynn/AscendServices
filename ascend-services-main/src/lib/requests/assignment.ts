import { log } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import type { VolunteerProfile } from "@/lib/volunteers/profile";

import { sendConnectionEmail, CONNECTION_EMAIL_TEMPLATE } from "./connection-email";
import { ASSIGNED_STATUS, NEW_STATUS } from "./status";
import {
  ASSIGNMENT_REQUEST_SELECT,
  toAssignmentRequestView,
  type AssignmentRequestRecord,
  type AssignmentRequestView,
} from "./views";

export const REQUEST_ASSIGNED_ACTION = "REQUEST_STATUS_CHANGED";
export const CONNECTION_EMAIL_ACTION = "CONNECTION_EMAIL_SENT";

/** Audit metadata marker: this transition came from the Help Wanted board. */
const BOARD_SOURCE = "help_wanted_board";

export type AssignRequestRejection = "not_found" | "already_claimed";

/**
 * Why the requester did or did not get the Spec v6 §4 introduction. Sending is
 * deliberately not part of the transaction: a mail failure must never undo a
 * volunteer's claim, it must be visible instead.
 */
export type ConnectionEmailOutcome = "sent" | "skipped_no_requester_email" | "failed";

export type AssignRequestResult =
  | {
      ok: true;
      request: AssignmentRequestView;
      connectionEmail: ConnectionEmailOutcome;
    }
  | { ok: false; reason: AssignRequestRejection };

export interface AssignRequestInput {
  requestId: string;
  /** The signed-in member claiming the request — assignment is self-service. */
  volunteer: Pick<VolunteerProfile, "id" | "name" | "bio">;
}

/**
 * Claims a NEW request for a volunteer: status becomes ASSIGNED, the audit
 * trail records the transition, and the requester is introduced by email.
 *
 * The status change is a conditional update (`status: NEW`), so two volunteers
 * tapping "Assign to me" on the same sticky note cannot both win — the loser
 * is told the note was already claimed rather than silently overwriting it.
 */
export async function assignRequestToVolunteer({
  requestId,
  volunteer,
}: AssignRequestInput): Promise<AssignRequestResult> {
  const assigned = await claimRequest(requestId, volunteer.id);

  if (!assigned) {
    const reason = await rejectionReasonFor(requestId);
    log({
      level: "warn",
      msg: "request_assign_rejected",
      action: REQUEST_ASSIGNED_ACTION,
      actorId: volunteer.id,
      requestId,
      reason,
    });
    return { ok: false, reason };
  }

  const request = toAssignmentRequestView(assigned);

  log({
    msg: "request_assigned",
    action: REQUEST_ASSIGNED_ACTION,
    actorId: volunteer.id,
    requestId: request.id,
    fromStatus: NEW_STATUS,
    toStatus: request.status,
    service_type: request.service_type,
    neighborhood: request.neighborhood,
  });

  return {
    ok: true,
    request,
    connectionEmail: await introduceVolunteer(request, volunteer),
  };
}

async function claimRequest(
  requestId: string,
  volunteerId: string,
): Promise<AssignmentRequestRecord | null> {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.request.updateMany({
      where: { id: requestId, status: NEW_STATUS },
      data: {
        status: ASSIGNED_STATUS,
        assignedToId: volunteerId,
        assignedAt: new Date(),
      },
    });
    if (claimed.count === 0) return null;

    const request = await tx.request.findUnique({
      where: { id: requestId },
      select: ASSIGNMENT_REQUEST_SELECT,
    });
    if (!request) return null;

    await tx.auditLog.create({
      data: {
        actorId: volunteerId,
        requestId,
        action: REQUEST_ASSIGNED_ACTION,
        fromStatus: NEW_STATUS,
        toStatus: ASSIGNED_STATUS,
        // Public-facing facts only: no requester name, address or contact.
        metadata: {
          source: BOARD_SOURCE,
          assigneeId: volunteerId,
          service_type: request.service_type,
          neighborhood: request.neighborhood,
        },
      },
    });

    return request as AssignmentRequestRecord;
  });
}

async function rejectionReasonFor(requestId: string): Promise<AssignRequestRejection> {
  const existing = await prisma.request.findUnique({
    where: { id: requestId },
    select: { id: true },
  });
  return existing ? "already_claimed" : "not_found";
}

/**
 * Best-effort introduction. The assignment already happened, so every outcome
 * is reported rather than thrown: an admin reading the logs can see exactly
 * which requesters still need a phone call.
 */
async function introduceVolunteer(
  request: AssignmentRequestView,
  volunteer: Pick<VolunteerProfile, "id" | "name" | "bio">,
): Promise<ConnectionEmailOutcome> {
  if (!request.requester_email) {
    log({
      level: "warn",
      msg: "connection_email_skipped",
      action: CONNECTION_EMAIL_ACTION,
      actorId: volunteer.id,
      requestId: request.id,
      reason: "no_requester_email",
    });
    return "skipped_no_requester_email";
  }

  try {
    const sent = await sendConnectionEmail({
      requester: { name: request.requester_name, email: request.requester_email },
      volunteer: { name: volunteer.name, bio: volunteer.bio },
      service_type: request.service_type,
    });

    await prisma.auditLog.create({
      data: {
        actorId: volunteer.id,
        requestId: request.id,
        action: CONNECTION_EMAIL_ACTION,
        metadata: {
          template: CONNECTION_EMAIL_TEMPLATE,
          transport: sent.transport,
          messageId: sent.messageId,
        },
      },
    });

    log({
      msg: "connection_email_sent",
      action: CONNECTION_EMAIL_ACTION,
      actorId: volunteer.id,
      requestId: request.id,
      template: CONNECTION_EMAIL_TEMPLATE,
      transport: sent.transport,
      messageId: sent.messageId,
    });

    return "sent";
  } catch (err) {
    log({
      level: "error",
      msg: "connection_email_failed",
      action: CONNECTION_EMAIL_ACTION,
      actorId: volunteer.id,
      requestId: request.id,
      error: err instanceof Error ? err.message : "unknown",
    });
    return "failed";
  }
}
