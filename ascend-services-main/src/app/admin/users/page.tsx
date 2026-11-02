import type { Metadata } from "next";

import { listAdminUsers } from "@/lib/admin/users";
import { requireRoleForPage } from "@/lib/auth/page-guard";
import { ADMIN_ROLE } from "@/lib/auth/roles";
import { getServiceTypeOptions } from "@/lib/requests/service-types";

import { PageIntro } from "../../page-intro";
import { UserManager } from "./user-manager";

export const metadata: Metadata = {
  title: "User management · Ascend Services",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** ADMIN only. Everyone else is sent to sign in, or sees a 404. */
export default async function UserManagementPage() {
  const session = await requireRoleForPage(ADMIN_ROLE);
  const users = await listAdminUsers();

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <PageIntro
        eyebrow="Ministry team"
        title="User management"
        image={{
          src: "/ministry/hands.jpg",
          alt: "Hands working together",
        }}
      >
        Add people, update their personal details, choose whether they are an
        Admin, a Server, or a Requester, and deactivate an account when they
        should no longer sign in.
      </PageIntro>
      <UserManager
        users={users}
        services={getServiceTypeOptions()}
        actorId={session.sub}
      />
    </main>
  );
}
