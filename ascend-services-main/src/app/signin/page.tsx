import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { canOpenHelpBoard } from "@/lib/auth/board-access";
import { ADMIN_ROLE } from "@/lib/auth/roles";
import { safeNextPath } from "@/lib/auth/return-path";
import { readSession } from "@/lib/auth/guard";
import { findVolunteerProfile } from "@/lib/volunteers/profile";
import { prisma } from "@/lib/prisma";
import {
  CREDENTIAL_SUMMARY_SELECT,
  toPasskeySummary,
} from "@/lib/auth/webauthn/credentials";

import { PageIntro } from "../page-intro";
import { SignedInAccount } from "./signed-in-account";
import { SignInPanel } from "./sign-in-panel";

export const metadata: Metadata = {
  title: "Sign in · Ascend Services",
  description: "Sign in with a passkey, or have a one-time link emailed to you.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const nextPath = safeNextPath((await searchParams).next);
  const session = await readSession();
  const viewer = session ? await findVolunteerProfile(session.sub) : null;
  if (viewer && nextPath) redirect(nextPath);

  const passkeys = viewer
    ? (
        await prisma.passkeyCredential.findMany({
          where: { userId: viewer.id },
          select: CREDENTIAL_SUMMARY_SELECT,
          orderBy: { createdAt: "desc" },
        })
      ).map(toPasskeySummary)
    : [];

  const signedIn = viewer !== null;

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <PageIntro
        eyebrow="Volunteer hub"
        title={signedIn ? "Your account" : "Sign in"}
        image={{
          src: "/ministry/garden.jpg",
          alt: "Community members tending a garden together in warm morning light",
        }}
      >
        {signedIn
          ? `You are signed in as ${viewer.email}. Sign out when you want to come back with a passkey.`
          : nextPath === "/serve"
            ? "Sign in to offer your time. New members get an emailed link, then add a passkey before the serve form opens."
            : "Sign in with a passkey if you have one. If you are new, we will email a one-time link so you can finish setting up."}
      </PageIntro>
      <div className="max-w-lg rounded-3xl bg-white p-6 shadow-md ring-1 ring-ascend-navy/5 sm:p-8">
        {signedIn ? (
          <SignedInAccount
            email={viewer.email}
            board={canOpenHelpBoard(viewer)}
            admin={viewer.role === ADMIN_ROLE}
            passkeys={passkeys}
          />
        ) : (
          <SignInPanel returnTo={nextPath ?? "/"} />
        )}
      </div>
    </main>
  );
}
