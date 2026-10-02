import type { RequestStatus } from "@/lib/requests/status";
import {
  slaThreshold,
  type SlaSettings,
  type SlaThresholdKey,
  type SlaThresholdUnit,
} from "@/lib/settings/sla-thresholds";

/**
 * The Spec v6 §6 SLA checks, described once so the monitor job, its report and
 * the admin alert all agree on what "overdue" means.
 *
 * Each check is a stuck lifecycle state plus the clock it is measured from, and
 * borrows its limit from the matching `SystemSettings` threshold — the numbers
 * live in the database (`src/lib/settings/sla-thresholds.ts`), never here.
 */

export const SLA_CHECK_KEYS = [
  "unassigned",
  "stalled_contact",
  "stalled_progress",
] as const;

export type SlaCheckKey = (typeof SLA_CHECK_KEYS)[number];

/**
 * The `Request` column a check measures age from. `IN_PROGRESS` has no
 * transition timestamp of its own yet, so progress is measured from the last
 * write to the row — see the note on `stalled_progress` below.
 */
export type SlaClockColumn = "createdAt" | "assignedAt" | "updatedAt";

export interface SlaCheck {
  key: SlaCheckKey;
  /** Lifecycle state a request must still be in for the check to apply. */
  status: RequestStatus;
  thresholdKey: SlaThresholdKey;
  clock: SlaClockColumn;
  /** Admin-facing summary of what the breach means. */
  description: string;
}

export const SLA_CHECKS: readonly SlaCheck[] = [
  {
    key: "unassigned",
    status: "NEW",
    thresholdKey: "unassigned_alert_hours",
    clock: "createdAt",
    description: "New request with no volunteer",
  },
  {
    key: "stalled_contact",
    status: "ASSIGNED",
    thresholdKey: "stalled_contact_alert_hours",
    clock: "assignedAt",
    description: "Assigned volunteer has not reached the requester",
  },
  {
    // Measured from `updatedAt` because no IN_PROGRESS timestamp exists: any
    // edit to the request counts as progress, so this under-reports rather
    // than crying wolf. A dedicated column would tighten it.
    key: "stalled_progress",
    status: "IN_PROGRESS",
    thresholdKey: "stalled_progress_days",
    clock: "updatedAt",
    description: "Request has sat in progress without an update",
  },
];

/**
 * One overdue request, described in the operational terms an admin can act on.
 * Everything here is safe to log and to email (see `SLA_REQUEST_SELECT`).
 */
export interface SlaBreach {
  requestId: string;
  check: SlaCheckKey;
  /** The state the request is stuck in. */
  status: RequestStatus;
  threshold_key: SlaThresholdKey;
  threshold: number;
  unit: SlaThresholdUnit;
  /** How long the request has been in that state. */
  age_hours: number;
  /** How far past the threshold it is. */
  overdue_hours: number;
  service_type: string;
  neighborhood: string;
  /** The clock the age was measured from, as an ISO timestamp. */
  since: string;
}

const MS_PER_HOUR = 60 * 60 * 1000;
const HOURS_PER_DAY = 24;

/** A check's limit in hours, whatever unit its threshold is configured in. */
export function thresholdHours(check: SlaCheck, thresholds: SlaSettings): number {
  const value = thresholds[check.thresholdKey];
  return slaThreshold(check.thresholdKey).unit === "days"
    ? value * HOURS_PER_DAY
    : value;
}

/**
 * The clock value at which a request becomes overdue: anything older than this
 * has been sitting longer than the threshold allows.
 */
export function cutoffFor(
  check: SlaCheck,
  thresholds: SlaSettings,
  now: Date,
): Date {
  return new Date(now.getTime() - thresholdHours(check, thresholds) * MS_PER_HOUR);
}

/** Whole-tenth hours between two instants; the alert copy never needs more. */
export function hoursBetween(since: Date, now: Date): number {
  return Math.round(((now.getTime() - since.getTime()) / MS_PER_HOUR) * 10) / 10;
}
