"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MediaUploadForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.set("title", title);
    body.set("description", description);
    if (file) body.set("file", file);
    if (link) body.set("link", link);

    try {
      const response = await fetch("/api/admin/media", { method: "POST", body });
      if (!response.ok) {
        setError("Add a title and either a video file (mp4, webm, or mov, up to 25 MB) or an https link.");
        return;
      }
      setTitle("");
      setDescription("");
      setLink("");
      setFile(null);
      router.refresh();
    } catch {
      setError("The video could not be published. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mb-8 flex flex-col gap-3 rounded-3xl bg-white p-6 shadow-md ring-1 ring-ascend-navy/5">
      <h2 className="font-display text-xl text-ascend-navy">Publish a video</h2>
      <label className="flex flex-col gap-1 text-sm font-semibold text-ascend-navy">
        Title
        <input required value={title} onChange={(event) => setTitle(event.target.value)} className="rounded-2xl border border-ascend-navy/15 px-3 py-2 font-normal" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-ascend-navy">
        Description
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="rounded-2xl border border-ascend-navy/15 px-3 py-2 font-normal" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-ascend-navy">
        Video file
        <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="font-normal" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-ascend-navy">
        Or an https link
        <input value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://www.youtube.com/watch?v=…" className="rounded-2xl border border-ascend-navy/15 px-3 py-2 font-normal" />
      </label>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <button type="submit" disabled={busy} className="ascend-gradient w-fit rounded-full px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
        {busy ? "Publishing…" : "Publish"}
      </button>
    </form>
  );
}
