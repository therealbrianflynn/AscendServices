"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function EventForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [location, setLocation] = useState("");
  const [link, setLink] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const start = new Date(startsAt);
    const end = endsAt ? new Date(endsAt) : null;
    try {
      const response = await fetch("/api/admin/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          details,
          location,
          link,
          startsAt: start.toISOString(),
          endsAt: end ? end.toISOString() : "",
        }),
      });
      if (!response.ok) {
        setError("Add a title and start time. Links must start with https, and the end must be after the start.");
        return;
      }
      setTitle("");
      setDetails("");
      setLocation("");
      setLink("");
      setStartsAt("");
      setEndsAt("");
      router.refresh();
    } catch {
      setError("The event could not be saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mb-8 grid gap-3 rounded-3xl bg-white p-6 shadow-md ring-1 ring-ascend-navy/5 sm:grid-cols-2">
      <h2 className="font-display text-xl text-ascend-navy sm:col-span-2">Add an event</h2>
      <label className="flex flex-col gap-1 text-sm font-semibold text-ascend-navy sm:col-span-2">
        Title
        <input required value={title} onChange={(event) => setTitle(event.target.value)} className="rounded-2xl border border-ascend-navy/15 px-3 py-2 font-normal" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-ascend-navy">
        Starts
        <input required type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="rounded-2xl border border-ascend-navy/15 px-3 py-2 font-normal" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-ascend-navy">
        Ends
        <input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="rounded-2xl border border-ascend-navy/15 px-3 py-2 font-normal" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-ascend-navy">
        Location
        <input value={location} onChange={(event) => setLocation(event.target.value)} className="rounded-2xl border border-ascend-navy/15 px-3 py-2 font-normal" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-ascend-navy">
        Link
        <input value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://" className="rounded-2xl border border-ascend-navy/15 px-3 py-2 font-normal" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-ascend-navy sm:col-span-2">
        Details
        <textarea value={details} onChange={(event) => setDetails(event.target.value)} rows={3} className="rounded-2xl border border-ascend-navy/15 px-3 py-2 font-normal" />
      </label>
      {error ? <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p> : null}
      <button type="submit" disabled={busy} className="ascend-gradient w-fit rounded-full px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
        {busy ? "Saving…" : "Add event"}
      </button>
    </form>
  );
}
