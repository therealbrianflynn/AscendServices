import type { Metadata } from "next";

import { listAdminRequests } from "@/lib/admin/requests";
import { listAdminUsers } from "@/lib/admin/users";
import { requireRoleForPage } from "@/lib/auth/page-guard";
import { ADMIN_ROLE } from "@/lib/auth/roles";
import { readSlaSettings } from "@/lib/settings/sla-settings";

import { PageIntro } from "../page-intro";
import { RequestsGrid } from "./requests-grid";
import { SlaSettingsForm } from "./sla-settings-form";
import { UsersGrid } from "./users-grid";
import { VolunteerImportPanel } from "./volunteer-import-panel";

export const metadata: Metadata = {
  title: "Admin console · Ascend Services",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Admin console (Spec v6 §6): the request pipeline, the member directory and
 * the SLA thresholds the monitor runs on.
 *
 * ADMIN only — the guard re-reads the role from the database, so revoking an
 * admin closes this page on their next navigation. Rows carry requester contact
 * details and street addresses, which is why nothing here is cached and nothing
 * here is logged.
 */
export default async function AdminConsolePage() {
  await requireRoleForPage(ADMIN_ROLE);

  const [requests, users, settings] = await Promise.all([
    listAdminRequests(),
    listAdminUsers(),
    readSlaSettings(),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <PageIntro
        eyebrow="Ministry team"
        title="Admin console"
        image={{
          src: "/ministry/garden.jpg",
          alt: "Neighbors working together in a garden",
        }}
      >
        Every request and every member, plus the thresholds that decide when a
        request is overdue. Requester addresses are shown here so you can
        coordinate — please treat them as private.
      </PageIntro>

      <section className="mt-10" aria-labelledby="admin-sla-heading">
        <h2 id="admin-sla-heading" className="text-xl font-semibold text-ascend-navy">
          SLA thresholds
        </h2>
        <p className="mt-1 text-sm text-ascend-taupe">
          Used by the SLA monitor to raise unassigned and stalled alerts.
        </p>
        <SlaSettingsForm settings={settings} />
      </section>

      <section className="mt-12" aria-labelledby="admin-requests-heading">
        <h2
          id="admin-requests-heading"
          className="text-xl font-semibold text-ascend-navy"
        >
          Requests
        </h2>
        <p className="mt-1 text-sm text-ascend-taupe">
          Sort any column, or search across every field.
        </p>
        <RequestsGrid requests={requests} />
      </section>

      <section className="mt-12" aria-labelledby="admin-users-heading">
        <h2 id="admin-users-heading" className="text-xl font-semibold text-ascend-navy">
          Members
        </h2>
        <p className="mt-1 text-sm text-ascend-taupe">
          Volunteers self-register as SERVER; ADMIN is granted by the seed script.
        </p>

        <h3
          id="admin-import-heading"
          className="mt-6 text-base font-semibold text-ascend-navy"
        >
          Bulk import
        </h3>
        <p className="mt-1 text-sm text-ascend-taupe">
          Upload a volunteer sheet. Members we already know gain the skills it
          lists; everyone else gets an account and a welcome email.
        </p>
        <VolunteerImportPanel />

        <UsersGrid users={users} />
      </section>
    </main>
  );
}
