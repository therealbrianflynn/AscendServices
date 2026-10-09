import type { Metadata } from "next";

import { readSession } from "@/lib/auth/guard";
import { ADMIN_ROLE } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";
import { findVolunteerProfile } from "@/lib/volunteers/profile";

import { PageIntro } from "../page-intro";
import { MediaCard } from "./media-card";
import { MediaUploadForm } from "./media-upload-form";

export const metadata: Metadata = {
  title: "Media · Ascend Services",
  description: "Stories and videos from the Ascend Services community.",
};

export const dynamic = "force-dynamic";

export default async function MediaPage() {
  const session = await readSession();
  const viewer = session ? await findVolunteerProfile(session.sub) : null;
  const admin = viewer?.role === ADMIN_ROLE;

  const items = await prisma.mediaItem.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, description: true, kind: true, source: true },
  });

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <PageIntro
        eyebrow="Stories"
        title="Media"
        image={{
          src: "/ministry/meal.jpg",
          alt: "A shared meal prepared for the community",
        }}
      >
        Watch how neighbors are serving one another. Admins can publish a video
        for everyone to see.
      </PageIntro>
      {admin ? <MediaUploadForm /> : null}
      {items.length === 0 ? (
        <p className="text-ascend-navy/75">No videos have been published yet.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {items.map((item) => (
            <MediaCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </main>
  );
}
