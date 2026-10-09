import type { Metadata } from "next";

import { getServiceTypeOptions } from "@/lib/requests/service-types";

import { PageIntro } from "../page-intro";
import { ServeForm } from "./serve-form";

export const metadata: Metadata = {
  title: "Serve · Ascend Services",
  description: "Offer your time to the community and start a background check.",
};

export default async function ServePage({
  searchParams,
}: {
  searchParams: Promise<{ pending?: string }>;
}) {
  const params = await searchParams;
  const pending = params.pending === "1";

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <PageIntro
        eyebrow="I want to serve"
        title="Offer your time"
        image={{
          src: "/ministry/hands.jpg",
          alt: "Hands working together on a community project",
        }}
      >
        Tell us how you can help. When you finish, we open the background-check form.
        An admin opens the Help Wanted board once that check is complete.
      </PageIntro>
      {pending ? (
        <p className="mb-6 max-w-lg rounded-2xl bg-ascend-sun/50 px-4 py-3 text-sm text-ascend-navy">
          The Help Wanted board opens after an admin confirms your background check.
        </p>
      ) : null}
      <div className="max-w-lg rounded-3xl bg-white p-6 shadow-md ring-1 ring-ascend-navy/5 sm:p-8">
        <ServeForm services={getServiceTypeOptions()} />
      </div>
    </main>
  );
}
