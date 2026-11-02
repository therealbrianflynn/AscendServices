import type { Metadata } from "next";

import { readSession } from "@/lib/auth/guard";
import { ADMIN_ROLE } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";
import { findVolunteerProfile } from "@/lib/volunteers/profile";

import { PageIntro } from "../page-intro";
import { EventCalendar } from "./event-calendar";
import { EventForm } from "./event-form";

export const metadata: Metadata = {
  title: "Events · Ascend Services",
  description: "Gatherings and service days for the Ascend Services community.",
};

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const session = await readSession();
  const viewer = session ? await findVolunteerProfile(session.sub) : null;
  const rows = await prisma.communityEvent.findMany({ orderBy: { startsAt: "asc" } });

  const events = rows.map((row) => ({
    id: row.id,
    title: row.title,
    details: row.details,
    location: row.location,
    link: row.link,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
  }));

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <PageIntro
        eyebrow="Gather"
        title="Community events"
        image={{
          src: "/ministry/hero.jpg",
          alt: "Neighbors gathered on a front porch",
        }}
      >
        See what is coming up. Click an event for the location, details, and any
        link the ministry team has shared.
      </PageIntro>
      {viewer?.role === ADMIN_ROLE ? <EventForm /> : null}
      <EventCalendar events={events} />
    </main>
  );
}
