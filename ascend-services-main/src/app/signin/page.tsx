import type { Metadata } from "next";

import { readSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import {
  CREDENTIAL_SUMMARY_SELECT,
  toPasskeySummary,
} from "@/lib/auth/webauthn/credentials";

import { PageIntro } from "../page-intro";
import { PasskeyEnrollment } from "./passkey-enrollment";
import { SignInPanel } from "./sign-in-panel";

export const metadata: Metadata = {
  title: "Sign in · Ascend Services",
  description: "Sign in with a passkey, or have a one-time link emailed to you.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const session = await readSession();

  // Enrolment needs an established session, so the page shows the sign-in
  // choices to a signed-out visitor and the passkey manager to a member.
  const passkeys = session
    ? (
        await prisma.passkeyCredential.findMany({
          where: { userId: session.sub },
          select: CREDENTIAL_SUMMARY_SELECT,
          orderBy: { createdAt: "desc" },
        })
      ).map(toPasskeySummary)
    : [];

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <PageIntro
        eyebrow="Volunteer hub"
        title={session ? "Your sign-in methods" : "Come serve"}
        image={{
          src: "/ministry/garden.jpg",
          alt: "Neighbors tending a garden together in warm morning light",
        }}
      >
        {session
          ? `Signed in as ${session.email}. Add a passkey to sign in with your fingerprint, face, or device PIN next time.`
          : "Use a passkey if you have one. If you are new, we will email a one-time link so you can join the Help Wanted board."}
      </PageIntro>
      <div className="max-w-lg rounded-3xl bg-white p-6 shadow-md ring-1 ring-ascend-navy/5 sm:p-8">
        {session ? <PasskeyEnrollment passkeys={passkeys} /> : <SignInPanel />}
      </div>
    </main>
  );
}
