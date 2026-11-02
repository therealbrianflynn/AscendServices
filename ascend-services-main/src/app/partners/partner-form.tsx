"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PartnerForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [website, setWebsite] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/partners", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, summary, website, location }),
      });
      if (!response.ok) {
        setError("Name, a short summary, and an https website are required.");
        return;
      }
      setName("");
      setSummary("");
      setWebsite("");
      setLocation("");
      router.refresh();
    } catch {
      setError("The partner could not be saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mb-8 grid gap-3 rounded-3xl bg-white p-6 shadow-md ring-1 ring-ascend-navy/5 sm:grid-cols-2">
      <h2 className="font-display text-xl text-ascend-navy sm:col-span-2">Add a partner church</h2>
      <label className="flex flex-col gap-1 text-sm font-semibold text-ascend-navy">
        Name
        <input required value={name} onChange={(event) => setName(event.target.value)} className="rounded-2xl border border-ascend-navy/15 px-3 py-2 font-normal" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-ascend-navy">
        Location
        <input value={location} onChange={(event) => setLocation(event.target.value)} className="rounded-2xl border border-ascend-navy/15 px-3 py-2 font-normal" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-ascend-navy sm:col-span-2">
        Website
        <input required value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://" className="rounded-2xl border border-ascend-navy/15 px-3 py-2 font-normal" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-ascend-navy sm:col-span-2">
        About this partner
        <textarea required value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} className="rounded-2xl border border-ascend-navy/15 px-3 py-2 font-normal" />
      </label>
      {error ? <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p> : null}
      <button type="submit" disabled={busy} className="ascend-gradient w-fit rounded-full px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
        {busy ? "Saving…" : "Add partner"}
      </button>
    </form>
  );
}
