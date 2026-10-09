import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { getServiceTypeOptions } from "@/lib/requests/service-types";
import { serveStep } from "@/lib/serve/access";
import { findVolunteerProfile } from "@/lib/volunteers/profile";

import { PageIntro } from "../page-intro";
import { PasskeyEnrollment } from "../signin/passkey-enrollment";
import { ServeForm } from "./serve-form";

export const metadata: Metadata = {
  title: "Serve · Ascend Services",
  description: "Offer your time to the community and start a background check.",
};

export const dynamic = "force-dynamic";

export default async function ServePage({
  searchParams,
}: {
  searchParams: Promise<{ pending?: string }>;
}) {
  const params = await searchParams;
  const pending = params.pending === "1";
  const session = await readSession();
  if (!session) redirect("/signin?next=/serve");

  const viewer = await findVolunteerProfile(session.sub);
  if (!viewer) redirect("/signin?next=/serve");

  const passkeyCount = await prisma.passkeyCredential.count({
    where: { userId: viewer.id },
  });
  const step = serveStep({ signedIn: true, passkeyCount });

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <PageIntro
        eyebrow="I want to serve"
        title={step === "passkey" ? "Add a passkey first" : "Offer your time"}
        image={{
          src: "/ministry/hands.jpg",
          alt: "Hands working together on a community project",
        }}
      >
        {step === "passkey"
          ? "You are signed in. Add a passkey on this device, then you can tell us how you serve and start the background check."
          : "You are signed in with a passkey. Tell us how you can help, and we will open the background-check form. An admin opens the Help Wanted board once that check is complete."}
      </PageIntro>
      {pending ? (
        <p className="mb-6 max-w-lg rounded-2xl bg-ascend-sun/50 px-4 py-3 text-sm text-ascend-navy">
          The Help Wanted board opens after an admin confirms your background check.
        </p>
      ) : null}
      <div className="max-w-lg rounded-3xl bg-white p-6 shadow-md ring-1 ring-ascend-navy/5 sm:p-8">
        {step === "passkey" ? (
          <PasskeyEnrollment
            passkeys={[]}
            unsupportedMessage="This browser cannot create a passkey. Use a phone or computer that supports passkeys, then return here to offer your time."
          />
        ) : (
          <ServeForm services={getServiceTypeOptions()} name={viewer.name} email={viewer.email} />
        )}
      </div>
    </main>
  );
}
