"use client";

import { REQUEST_STATUS_LABELS } from "@/lib/requests/status";
import type { AdminRequestView } from "@/lib/requests/views";

import { createAdminColumnHelper, formatDay } from "./admin-grid";
import { DataGrid } from "./data-grid";

const UNASSIGNED = "Unassigned";
const NO_EMAIL = "No email on file";

const helper = createAdminColumnHelper<AdminRequestView>();

/**
 * The admin request pipeline. Accessors return display strings so that sorting
 * and the whole-row search both work on what an admin can actually see.
 *
 * The street address is here because an admin coordinating a visit needs it;
 * it is PII all the same, which is why this grid only ever renders behind the
 * ADMIN page guard and is never logged.
 */
const columns = helper.columns([
  helper.accessor((request) => REQUEST_STATUS_LABELS[request.status], {
    id: "status",
    header: "Status",
  }),
  helper.accessor("service_type", { header: "Help needed" }),
  helper.accessor("requester_name", { header: "Requester" }),
  helper.accessor((request) => request.requester_email ?? NO_EMAIL, {
    id: "requester_email",
    header: "Contact",
  }),
  helper.accessor("neighborhood", { header: "Community" }),
  helper.accessor("street_address", { header: "Street address" }),
  helper.accessor((request) => request.assignee?.name ?? UNASSIGNED, {
    id: "assignee",
    header: "Volunteer",
  }),
  helper.accessor((request) => formatDay(request.createdAt), {
    id: "createdAt",
    header: "Requested",
  }),
]);

export function RequestsGrid({ requests }: { requests: AdminRequestView[] }) {
  return (
    <DataGrid
      columns={columns}
      data={requests}
      caption="All help requests, newest first"
      searchLabel="Search requests"
      emptyMessage="No requests have come in yet."
    />
  );
}
