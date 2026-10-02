import { parseRequestStatus, type RequestStatus } from "./status";

/**
 * Serialisation boundary for the `Request` model.
 *
 * `street_address` is PII (Spec v6 §3: "Private; visible only when assigned").
 * The public projection cannot leak it because the column is never selected
 * from the database, and the view type has no field to put it in.
 */
export const PUBLIC_REQUEST_SELECT = {
  id: true,
  service_type: true,
  neighborhood: true,
  status: true,
  createdAt: true,
} as const;

/**
 * What the matched volunteer may see about their own assignment. The street
 * address appears here and only here on an authenticated path: Spec v6 §3 makes
 * it "visible only when assigned", and every query using this projection is
 * scoped to `assignedToId = <the volunteer>`.
 *
 * Prayer text is deliberately absent: `prayer_private` defaults to true and
 * sharing it beyond staff needs the requester's opt-in, not an assignment.
 */
export const ASSIGNMENT_REQUEST_SELECT = {
  id: true,
  requester_name: true,
  requester_email: true,
  service_type: true,
  neighborhood: true,
  street_address: true,
  status: true,
  createdAt: true,
  assignedAt: true,
} as const;

/**
 * What an ADMIN may see in the console grid. Admins run the ministry, so the
 * street address and the requester's contact details are legitimately theirs to
 * read — but they are still PII: this projection is only ever rendered behind
 * `requireRole(ADMIN)` on a `no-store` response, and never written to a log.
 *
 * Prayer text is absent on purpose. An admin may read it (Spec v6 §5), but a
 * list of every request is not the place to put it.
 */
export const ADMIN_REQUEST_SELECT = {
  id: true,
  requester_name: true,
  requester_email: true,
  service_type: true,
  neighborhood: true,
  street_address: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  assignedAt: true,
  assignedTo: { select: { id: true, name: true, email: true } },
} as const;

/**
 * What the SLA monitor (Spec v6 §6) reads. Breaches are written to the
 * structured log and emailed to admins, so this projection deliberately stops
 * at the operational facts: no requester name, contact address, street address,
 * prayer text or tracking token can leak into an alert, because none of them
 * are ever fetched.
 */
export const SLA_REQUEST_SELECT = {
  id: true,
  service_type: true,
  neighborhood: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  assignedAt: true,
} as const;

export const TRACKING_REQUEST_SELECT = {
  id: true,
  requester_name: true,
  service_type: true,
  neighborhood: true,
  street_address: true,
  prayer_request: true,
  prayer_private: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Safe for unauthenticated board listings: no name, address or prayer text. */
export interface PublicRequestView {
  id: string;
  service_type: string;
  neighborhood: string;
  status: RequestStatus;
  createdAt: string;
}

/** Private to the assigned volunteer: enough to show up at the right door. */
export interface AssignmentRequestView {
  id: string;
  requester_name: string;
  requester_email: string | null;
  service_type: string;
  neighborhood: string;
  street_address: string;
  status: RequestStatus;
  createdAt: string;
  assignedAt: string | null;
}

/** The volunteer a request is assigned to, as the admin console shows them. */
export interface RequestAssigneeView {
  id: string;
  name: string;
  email: string;
}

/** Admin console row: the whole request plus who is carrying it. */
export interface AdminRequestView {
  id: string;
  requester_name: string;
  requester_email: string | null;
  service_type: string;
  neighborhood: string;
  street_address: string;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
  assignedAt: string | null;
  assignee: RequestAssigneeView | null;
}

/** Private to the holder of the tracking token: echoes what they submitted. */
export interface TrackingRequestView {
  id: string;
  requester_name: string;
  service_type: string;
  neighborhood: string;
  street_address: string;
  prayer_request: string | null;
  prayer_private: boolean;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PublicRequestRecord {
  id: string;
  service_type: string;
  neighborhood: string;
  status: string;
  createdAt: Date;
}

export interface AssignmentRequestRecord extends PublicRequestRecord {
  requester_name: string;
  requester_email: string | null;
  street_address: string;
  assignedAt: Date | null;
}

export interface AdminRequestRecord extends AssignmentRequestRecord {
  updatedAt: Date;
  assignedTo: RequestAssigneeView | null;
}

/** PII-free row the SLA monitor evaluates against the thresholds. */
export interface SlaRequestRecord extends PublicRequestRecord {
  updatedAt: Date;
  assignedAt: Date | null;
}

export interface TrackingRequestRecord extends PublicRequestRecord {
  requester_name: string;
  street_address: string;
  prayer_request: string | null;
  prayer_private: boolean;
  updatedAt: Date;
}

export function toPublicRequestView(record: PublicRequestRecord): PublicRequestView {
  return {
    id: record.id,
    service_type: record.service_type,
    neighborhood: record.neighborhood,
    status: parseRequestStatus(record.status),
    createdAt: record.createdAt.toISOString(),
  };
}

export function toAssignmentRequestView(
  record: AssignmentRequestRecord,
): AssignmentRequestView {
  return {
    ...toPublicRequestView(record),
    requester_name: record.requester_name,
    requester_email: record.requester_email,
    street_address: record.street_address,
    assignedAt: record.assignedAt ? record.assignedAt.toISOString() : null,
  };
}

export function toAdminRequestView(record: AdminRequestRecord): AdminRequestView {
  return {
    ...toAssignmentRequestView(record),
    updatedAt: record.updatedAt.toISOString(),
    assignee: record.assignedTo,
  };
}

export function toTrackingRequestView(
  record: TrackingRequestRecord,
): TrackingRequestView {
  return {
    ...toPublicRequestView(record),
    requester_name: record.requester_name,
    street_address: record.street_address,
    prayer_request: record.prayer_request,
    prayer_private: record.prayer_private,
    updatedAt: record.updatedAt.toISOString(),
  };
}
