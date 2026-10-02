"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { PasskeySummary } from "@/lib/auth/webauthn/credentials";

import { describeApiError, describeBrowserError } from "./passkey-feedback";
import { usePasskeySupport } from "./use-passkey-support";

const primaryButtonClass =
  "ascend-gradient rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60";
const fieldClass =
  "mt-1 w-full rounded-xl border border-ascend-taupe/50 bg-white px-3 py-2 text-ascend-ink shadow-sm outline-none focus:border-ascend-sky-deep focus:ring-2 focus:ring-ascend-sky/50";

export interface PasskeyEnrollmentProps {
  passkeys: PasskeySummary[];
}

export function PasskeyEnrollment({ passkeys }: PasskeyEnrollmentProps) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const supported = usePasskeySupport();

  async function addPasskey() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const optionsResponse = await fetch("/api/auth/passkey/register/options", {
        method: "POST",
      });
      const optionsBody = await optionsResponse.json().catch(() => null);
      if (!optionsResponse.ok) {
        setError(describeApiError(optionsBody?.error));
        return;
      }

      let attestation;
      try {
        attestation = await startRegistration({ optionsJSON: optionsBody.options });
      } catch (err) {
        setError(describeBrowserError(err));
        return;
      }

      const verifyResponse = await fetch("/api/auth/passkey/register/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response: attestation, label: label.trim() || undefined }),
      });
      const verifyBody = await verifyResponse.json().catch(() => null);
      if (!verifyResponse.ok) {
        setError(describeApiError(verifyBody?.error));
        return;
      }

      setLabel("");
      setNotice("Passkey added. You can use it to sign in from now on.");
      router.refresh();
    } catch {
      setError(describeApiError(null));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 flex flex-col gap-5">
      <div>
        <label htmlFor="label" className="block text-sm font-medium text-ascend-navy">
          Name this device (optional)
        </label>
        <input
          id="label"
          name="label"
          type="text"
          maxLength={60}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Work laptop"
          className={fieldClass}
        />
      </div>

      {supported ? (
        <button
          type="button"
          onClick={addPasskey}
          disabled={busy}
          className={primaryButtonClass}
        >
          {busy ? "Waiting for your device…" : "Add a passkey"}
        </button>
      ) : (
        <p className="rounded-xl bg-ascend-bg px-3 py-2 text-sm text-ascend-navy/80">
          This browser does not support passkeys. Email links will keep working.
        </p>
      )}

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? <p className="text-sm text-ascend-navy">{notice}</p> : null}

      <div>
        <h2 className="text-sm font-medium text-ascend-navy">Your passkeys</h2>
        {passkeys.length === 0 ? (
          <p className="mt-1 text-sm text-ascend-navy/70">
            None yet — you are signing in with emailed links.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {passkeys.map((passkey) => (
              <li
                key={passkey.id}
                className="rounded-xl border border-ascend-taupe/30 px-3 py-2 text-sm text-ascend-navy/80"
              >
                <span className="font-medium text-ascend-navy">
                  {passkey.label ?? "Passkey"}
                </span>
                <span className="block text-xs text-ascend-taupe">
                  Added {new Date(passkey.createdAt).toLocaleDateString()}
                  {passkey.lastUsedAt
                    ? ` · last used ${new Date(passkey.lastUsedAt).toLocaleDateString()}`
                    : " · not used yet"}
                  {passkey.backedUp ? " · synced" : " · this device only"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
