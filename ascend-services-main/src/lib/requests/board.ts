import { prisma } from "@/lib/prisma";
import type { VolunteerProfile } from "@/lib/volunteers/profile";

import { resolveBoardSkillFilter, type BoardSkillFilter } from "./skill-filter";
import { ASSIGNED_STATUS, NEW_STATUS, type RequestStatus } from "./status";
import {
  ASSIGNMENT_REQUEST_SELECT,
  PUBLIC_REQUEST_SELECT,
  toAssignmentRequestView,
  toPublicRequestView,
  type AssignmentRequestView,
  type PublicRequestView,
} from "./views";

/** One screen of sticky notes; the board is a working surface, not an archive. */
const BOARD_LIMIT = 60;

/** "My Assignments" (Spec v6 §5, Tab 2) — everything not yet finished. */
export const ACTIVE_ASSIGNMENT_STATUSES: RequestStatus[] = [
  ASSIGNED_STATUS,
  "CONTACT_MADE",
  "IN_PROGRESS",
];

export interface HelpWantedBoard {
  /** NEW requests matching the filter. Public projection: no name, no address. */
  open: PublicRequestView[];
  filter: BoardSkillFilter;
}

export interface LoadHelpWantedBoardInput {
  volunteer: Pick<VolunteerProfile, "services_provided">;
  requestedSkills?: readonly string[];
  limit?: number;
}

/**
 * Open requests for the Help Wanted board. Cards are built from
 * `PUBLIC_REQUEST_SELECT`, so an unclaimed note cannot carry the requester's
 * name or street address however the UI renders it.
 */
export async function loadHelpWantedBoard({
  volunteer,
  requestedSkills = [],
  limit = BOARD_LIMIT,
}: LoadHelpWantedBoardInput): Promise<HelpWantedBoard> {
  const filter = resolveBoardSkillFilter({
    providedSkills: volunteer.services_provided,
    requestedSkills,
  });

  const records = await prisma.request.findMany({
    where: {
      status: NEW_STATUS,
      ...(filter.serviceTypes ? { service_type: { in: filter.serviceTypes } } : {}),
    },
    select: PUBLIC_REQUEST_SELECT,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return { open: records.map(toPublicRequestView), filter };
}

/**
 * The volunteer's own active assignments. Scoped to `assignedToId`, which is
 * what makes the street address in `ASSIGNMENT_REQUEST_SELECT` safe to select.
 */
export async function listAssignmentsForVolunteer(
  volunteerId: string,
  limit: number = BOARD_LIMIT,
): Promise<AssignmentRequestView[]> {
  const records = await prisma.request.findMany({
    where: {
      assignedToId: volunteerId,
      status: { in: ACTIVE_ASSIGNMENT_STATUSES },
    },
    select: ASSIGNMENT_REQUEST_SELECT,
    orderBy: { assignedAt: "desc" },
    take: limit,
  });

  return records.map(toAssignmentRequestView);
}
