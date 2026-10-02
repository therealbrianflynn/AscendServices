/**
 * Request lifecycle states. Kept in lockstep with the Prisma `RequestStatus`
 * enum (see `prisma/schema.prisma`); `src/__tests__/request-status.test.ts`
 * asserts the parity so the portal and the database can never drift.
 */
export const REQUEST_STATUSES = [
  "NEW",
  "ASSIGNED",
  "CONTACT_MADE",
  "IN_PROGRESS",
  "COMPLETE",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const NEW_STATUS: RequestStatus = "NEW";
export const ASSIGNED_STATUS: RequestStatus = "ASSIGNED";

/** Requester-facing copy for the self-service portal. */
export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  NEW: "Received",
  ASSIGNED: "Volunteer assigned",
  CONTACT_MADE: "Volunteer has reached out",
  IN_PROGRESS: "Help in progress",
  COMPLETE: "Complete",
};

export const REQUEST_STATUS_DESCRIPTIONS: Record<RequestStatus, string> = {
  NEW: "We have your request and are looking for the right volunteer.",
  ASSIGNED: "A volunteer has accepted your request and will contact you soon.",
  CONTACT_MADE: "Your volunteer has reached out to arrange the details.",
  IN_PROGRESS: "Your volunteer is working on this right now.",
  COMPLETE: "This request is finished. Thank you for letting us serve you.",
};

export function isRequestStatus(value: unknown): value is RequestStatus {
  return (
    typeof value === "string" && (REQUEST_STATUSES as readonly string[]).includes(value)
  );
}

export function parseRequestStatus(value: unknown): RequestStatus {
  if (!isRequestStatus(value)) {
    throw new Error(
      `Unknown request status "${String(value)}"; expected ${REQUEST_STATUSES.join(" | ")}`,
    );
  }
  return value;
}
