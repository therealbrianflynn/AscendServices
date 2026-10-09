"use client";

import Link from "next/link";
import { useState } from "react";

import type { PasskeySummary } from "@/lib/auth/webauthn/credentials";

import { PasskeyEnrollment } from "./passkey-enrollment";

export function SignedInAccount({
  email,
  board,
  admin,
  passkeys,
}: {
  email: string;
  board: boolean;
  admin: boolean;
  passkeys: PasskeySummary[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        setError("We could not sign you out. Please try again.");
        return;
      }
      window.location.assign("/signin");
    } catch {
      setError("We could not sign you out. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-ascend-navy">Signed in as {email}.</p>
        <p className="mt-2 text-sm text-ascend-navy/75">
          To sign in with your passkey on this device, sign out first, then choose
          “Sign in with a passkey”.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        {board ? (
          <Link href="/board" className="ascend-gradient rounded-full px-4 py-2.5 text-sm font-semibold text-white">
            Help wanted board
          </Link>
        ) : null}
        {admin ? (
          <Link href="/admin" className="rounded-full bg-ascend-navy px-4 py-2.5 text-sm font-semibold text-white">
            Admin
          </Link>
        ) : null}
        <button
          type="button"
          onClick={signOut}
          disabled={busy}
          className="rounded-full border border-ascend-navy/15 bg-white px-4 py-2.5 text-sm font-semibold text-ascend-navy disabled:opacity-60"
        >
          {busy ? "Signing out…" : "Sign out"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <PasskeyEnrollment passkeys={passkeys} />
    </div>
  );
}
