"use client";

import type { AdminUserView } from "@/lib/admin/users";

import { createAdminColumnHelper, formatDay } from "./admin-grid";
import { DataGrid } from "./data-grid";

const NO_SKILLS = "No skills yet";

const helper = createAdminColumnHelper<AdminUserView>();

/** The member directory: who can sign in, and what they have volunteered for. */
const columns = helper.columns([
  helper.accessor("name", { header: "Name" }),
  helper.accessor("email", { header: "Email" }),
  helper.accessor("role", { header: "Role" }),
  helper.accessor(
    (user) =>
      user.services_provided.length > 0
        ? user.services_provided.join(", ")
        : NO_SKILLS,
    { id: "services_provided", header: "Skills" },
  ),
  helper.accessor((user) => formatDay(user.createdAt), {
    id: "createdAt",
    header: "Joined",
  }),
]);

export function UsersGrid({ users }: { users: AdminUserView[] }) {
  return (
    <DataGrid
      columns={columns}
      data={users}
      caption="Members who can sign in, newest first"
      searchLabel="Search members"
      emptyMessage="No members have signed in yet."
    />
  );
}
