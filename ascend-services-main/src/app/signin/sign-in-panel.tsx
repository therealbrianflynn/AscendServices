"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { describeApiError, describeBrowserError } from "./passkey-feedback";
import { usePasskeySupport } from "./use-passkey-support";

const primaryButtonClass =
  "w-full rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60";
const secondaryButtonClass =
  "w-full rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-900 disabled:opacity-60";
const fieldClass =
  "mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200";

type Busy = "passkey" | "magic-link" | null;

export function SignInPanel() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const passkeysSupported = usePasskeySupport();

  async function signInWithPasskey() {
    if (busy) return;
    setBusy("passkey");
    setError(null);
    setNotice(null);

    try {
      const optionsResponse = await fetch("/api/auth/passkey/authenticate/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() || undefined }),
      });
      const optionsBody = await optionsResponse.json().catch(() => null);
      if (!optionsResponse.ok) {
        setError(describeApiError(optionsBody?.error));
        return;
      }

      let assertion;
      try {
        assertion = await startAuthentication({ optionsJSON: optionsBody.options });
      } catch (err) {
        setError(describeBrowserError(err));
        return;
      }

      const verifyResponse = await fetch("/api/auth/passkey/authenticate/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response: assertion }),
      });
      const verifyBody = await verifyResponse.json().catch(() => null);
      if (!verifyResponse.ok) {
        setError(describeApiError(verifyBody?.error));
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError(describeApiError(null));
    } finally {
      setBusy(null);
    }
  }

  async function sendMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy("magic-link");
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setError(
          body?.error === "invalid_email"
            ? "Please enter a valid email address."
            : describeApiError(body?.error),
        );
        return;
      }

      setNotice("Check your email for a one-time sign-in link.");
    } catch {
      setError(describeApiError(null));
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={sendMagicLink} noValidate className="mt-8 flex flex-col gap-5">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-stone-800">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username webauthn"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={fieldClass}
        />
        <p className="mt-1 text-xs text-stone-500">
          Optional for passkeys — required for an emailed link.
        </p>
      </div>

      {passkeysSupported ? (
        <button
          type="button"
          onClick={signInWithPasskey}
          disabled={busy !== null}
          className={primaryButtonClass}
        >
          {busy === "passkey" ? "Waiting for your passkey…" : "Sign in with a passkey"}
        </button>
      ) : (
        <p className="rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-600">
          This browser does not support passkeys. Use the emailed link below.
        </p>
      )}

      <button
        type="submit"
        disabled={busy !== null || email.trim().length === 0}
        className={secondaryButtonClass}
      >
        {busy === "magic-link" ? "Sending…" : "Email me a sign-in link"}
      </button>

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? <p className="text-sm text-stone-700">{notice}</p> : null}
    </form>
  );
}
