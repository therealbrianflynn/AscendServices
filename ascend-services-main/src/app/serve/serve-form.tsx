"use client";

import { useState } from "react";

import { BACKGROUND_CHECK_URL } from "@/lib/serve/background-check";

export function ServeForm({ services }: { services: readonly string[] }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [emailSent, setEmailSent] = useState(true);

  function toggle(service: string) {
    setChosen((current) =>
      current.includes(service)
        ? current.filter((item) => item !== service)
        : [...current, service],
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const popup = window.open("about:blank", "ascend-background-check");

    try {
      const response = await fetch("/api/serve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, services: chosen, bio }),
      });
      const body = (await response.json().catch(() => null)) as
        | { backgroundCheckUrl?: string; emailSent?: boolean }
        | null;
      if (!response.ok) {
        popup?.close();
        setError("Please check your name, email, and at least one way you can serve.");
        return;
      }
      const url = body?.backgroundCheckUrl ?? BACKGROUND_CHECK_URL;
      if (popup) {
        popup.location.href = url;
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      setEmailSent(body?.emailSent !== false);
      setSaved(true);
    } catch {
      popup?.close();
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-ascend-navy">
          Your application is saved. A background-check form should have opened in a
          new window.
        </p>
        {emailSent ? (
          <p className="text-sm text-ascend-navy/75">
            We also sent a sign-in link to {email}. An admin will open the Help
            Wanted board after your background check is complete.
          </p>
        ) : (
          <p className="text-sm text-red-800">
            We saved your application, but the sign-in email could not be sent. You
            can still finish the background check, then ask an admin for a sign-in link.
          </p>
        )}
        <a
          href={BACKGROUND_CHECK_URL}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-semibold text-ascend-sky-deep underline"
        >
          Open the background check again
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-semibold text-ascend-navy">
        Name
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded-2xl border border-ascend-navy/15 px-3 py-2 font-normal"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-ascend-navy">
        Email
        <input
          required
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-2xl border border-ascend-navy/15 px-3 py-2 font-normal"
        />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-ascend-navy">Ways you can serve</legend>
        {services.map((service) => (
          <label key={service} className="flex items-center gap-2 text-sm text-ascend-navy">
            <input
              type="checkbox"
              checked={chosen.includes(service)}
              onChange={() => toggle(service)}
            />
            {service}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 text-sm font-semibold text-ascend-navy">
        A little about you
        <textarea
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          rows={4}
          className="rounded-2xl border border-ascend-navy/15 px-3 py-2 font-normal"
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="ascend-gradient rounded-full px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? "Saving…" : "Continue to background check"}
      </button>
    </form>
  );
}
