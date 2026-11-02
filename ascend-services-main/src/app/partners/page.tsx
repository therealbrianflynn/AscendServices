import type { Metadata } from "next";

import { readSession } from "@/lib/auth/guard";
import { ADMIN_ROLE } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";
import { findVolunteerProfile } from "@/lib/volunteers/profile";

import { PageIntro } from "../page-intro";
import { PartnerForm } from "./partner-form";

export const metadata: Metadata = {
  title: "Partners · Ascend Services",
  description: "Churches and ministries walking with Ascend Services.",
};

export const dynamic = "force-dynamic";

export default async function PartnersPage() {
  const session = await readSession();
  const viewer = session ? await findVolunteerProfile(session.sub) : null;
  const partners = await prisma.partner.findMany({ orderBy: { name: "asc" } });

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <PageIntro
        eyebrow="Together"
        title="Partner churches"
        image={{
          src: "/ministry/garden.jpg",
          alt: "People working side by side in a community garden",
        }}
      >
        Ascend Services walks with local churches. These partners help us find
        people who want to serve and communities that need a hand.
      </PageIntro>
      {viewer?.role === ADMIN_ROLE ? <PartnerForm /> : null}
      {partners.length === 0 ? (
        <p className="text-ascend-navy/75">Partner churches will be listed here.</p>
      ) : (
        <ul className="grid gap-5 md:grid-cols-2">
          {partners.map((partner) => (
            <li key={partner.id} className="rounded-3xl bg-white p-6 shadow-md ring-1 ring-ascend-navy/5">
              <h2 className="font-display text-2xl text-ascend-navy">{partner.name}</h2>
              {partner.location ? <p className="mt-1 text-sm text-ascend-sky-deep">{partner.location}</p> : null}
              <p className="mt-3 text-ascend-navy/80">{partner.summary}</p>
              <a href={partner.website} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm font-semibold text-ascend-sky-deep underline">
                Visit website
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
