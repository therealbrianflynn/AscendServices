import type { Metadata } from "next";

import { readSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import {
  CREDENTIAL_SUMMARY_SELECT,
  toPasskeySummary,
} from "@/lib/auth/webauthn/credentials";

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
    <main className="mx-auto max-w-lg px-6 py-14">
      <p className="text-sm font-medium uppercase tracking-wide text-stone-500">
        Ascend Services
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">
        {session ? "Your sign-in methods" : "Sign in"}
      </h1>

      {session ? (
        <>
          <p className="mt-3 text-stone-600">
            Signed in as {session.email}. Add a passkey to sign in with your
            fingerprint, face or device PIN next time.
          </p>
          <PasskeyEnrollment passkeys={passkeys} />
        </>
      ) : (
        <>
          <p className="mt-3 text-stone-600">
            Use a passkey if you have one. No passkey yet? We will email you a
            one-time sign-in link instead.
          </p>
          <SignInPanel />
        </>
      )}
    </main>
  );
}
