"use client";

import { youtubeEmbedUrl } from "@/lib/community/content";

export interface MediaCardItem {
  id: string;
  title: string;
  description: string;
  kind: string;
  source: string;
}

export function MediaCard({ item }: { item: MediaCardItem }) {
  const embed = item.kind === "link" ? youtubeEmbedUrl(item.source) : null;

  return (
    <article className="overflow-hidden rounded-3xl bg-white shadow-md ring-1 ring-ascend-navy/5">
      {item.kind === "file" ? (
        <video controls className="aspect-video w-full bg-ascend-navy" src={`/api/media/${item.id}`}>
          <track kind="captions" />
        </video>
      ) : embed ? (
        <iframe
          title={item.title}
          src={embed}
          className="aspect-video w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <a href={item.source} target="_blank" rel="noreferrer" className="block bg-ascend-navy px-5 py-10 text-sm font-semibold text-white">
          Open video
        </a>
      )}
      <div className="p-5">
        <h2 className="font-display text-2xl text-ascend-navy">{item.title}</h2>
        {item.description ? <p className="mt-2 text-ascend-navy/80">{item.description}</p> : null}
      </div>
    </article>
  );
}
