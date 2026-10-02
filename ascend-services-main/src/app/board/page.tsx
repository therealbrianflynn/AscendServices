import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/lib/auth/guard";
import { listAssignmentsForVolunteer, loadHelpWantedBoard } from "@/lib/requests/board";
import { REQUEST_STATUS_LABELS } from "@/lib/requests/status";
import type { AssignmentRequestView } from "@/lib/requests/views";
import { findVolunteerProfile } from "@/lib/volunteers/profile";

import { PageIntro } from "../page-intro";
import { AssignButton } from "./assign-button";
import { BOARD_SKILL_PARAM, readSkillParam } from "./board-params";
import { SkillFilter } from "./skill-filter";
import { StickyNote } from "./sticky-note";

export const metadata: Metadata = {
  title: "Help Wanted board · Ascend Services",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Volunteer Hub (Spec v6 §5): a sticky-note board of NEW requests filtered by
 * the member's own skills, plus the assignments they have already claimed.
 *
 * Open notes are built from the public projection; the street address appears
 * only in "My assignments", which is scoped to this volunteer's own rows.
 */
export default async function HelpWantedBoardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await readSession();
  if (!session) redirect("/signin");

  const volunteer = await findVolunteerProfile(session.sub);
  if (!volunteer) redirect("/signin");

  const requestedSkills = readSkillParam((await searchParams)[BOARD_SKILL_PARAM]);

  const [board, assignments] = await Promise.all([
    loadHelpWantedBoard({ volunteer, requestedSkills }),
    listAssignmentsForVolunteer(volunteer.id),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <PageIntro
        eyebrow="Volunteer hub"
        title="Help Wanted board"
        image={{
          src: "/ministry/hands.jpg",
          alt: "Hands repairing a lamp beside a cup of tea",
        }}
      >
        Open requests waiting for a volunteer. Take one, and we will introduce
        you to the person who asked.
      </PageIntro>

      <SkillFilter available={board.filter.available} selected={board.filter.requested} />

      {board.open.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-ascend-taupe/50 p-8 text-center text-ascend-taupe">
          Nothing open in{" "}
          {board.filter.applied.length > 0
            ? board.filter.applied.join(", ")
            : "your area"}{" "}
          right now. Thank you for checking in.
        </p>
      ) : (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {board.open.map((request, index) => (
            <StickyNote
              key={request.id}
              request={request}
              index={index}
              action={<AssignButton requestId={request.id} />}
            />
          ))}
        </ul>
      )}

      <section className="mt-14">
        <h2 className="text-xl font-semibold text-ascend-navy">My assignments</h2>
        <p className="mt-1 text-sm text-ascend-taupe">
          Contact details are shared with you because these requests are yours.
          Please keep them private.
        </p>

        {assignments.length === 0 ? (
          <p className="mt-4 text-sm text-ascend-ink">
            You have no active assignments yet.
          </p>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {assignments.map((assignment) => (
              <AssignmentCard key={assignment.id} assignment={assignment} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function AssignmentCard({ assignment }: { assignment: AssignmentRequestView }) {
  return (
    <li className="rounded-xl border border-ascend-taupe/30 bg-ascend-surface p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ascend-taupe">
        {REQUEST_STATUS_LABELS[assignment.status]}
      </p>
      <h3 className="mt-1 text-lg font-semibold text-ascend-navy">
        {assignment.service_type}
      </h3>
      <dl className="mt-3 grid gap-2 text-sm">
        <Detail label="Requester" value={assignment.requester_name} />
        <Detail label="Neighborhood" value={assignment.neighborhood} />
        <Detail label="Street address" value={assignment.street_address} />
        <Detail
          label="Email"
          value={assignment.requester_email ?? "Not provided — please call the office."}
        />
      </dl>
    </li>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ascend-taupe">{label}</dt>
      <dd className="text-ascend-ink">{value}</dd>
    </div>
  );
}
