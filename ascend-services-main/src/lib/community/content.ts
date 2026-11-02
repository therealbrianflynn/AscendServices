const TITLE_MAX = 120;
const TEXT_MAX = 2000;
const LOCATION_MAX = 200;

export interface CommunityEventInput {
  title: string;
  details: string;
  location: string;
  link: string;
  startsAt: Date;
  endsAt: Date | null;
}

export type EventField = "title" | "details" | "location" | "link" | "startsAt" | "endsAt";
export type EventFieldErrors = Partial<Record<EventField, "required" | "invalid" | "too_long">>;

export function parseCommunityEvent(
  source: unknown,
): { ok: true; value: CommunityEventInput } | { ok: false; fields: EventFieldErrors } {
  if (typeof source !== "object" || source === null) {
    return { ok: false, fields: { title: "required", startsAt: "required" } };
  }
  const body = source as Record<string, unknown>;
  const fields: EventFieldErrors = {};

  const title = readText(body.title);
  if (!title) fields.title = "required";
  else if (title.length > TITLE_MAX) fields.title = "too_long";

  const details = readText(body.details);
  if (details.length > TEXT_MAX) fields.details = "too_long";

  const location = readText(body.location);
  if (location.length > LOCATION_MAX) fields.location = "too_long";

  const link = readText(body.link);
  if (link && !isHttpsUrl(link)) fields.link = "invalid";

  const startsAt = readDate(body.startsAt);
  if (!startsAt) fields.startsAt = "required";

  const endsAt = body.endsAt ? readDate(body.endsAt) : null;
  if (body.endsAt && !endsAt) fields.endsAt = "invalid";
  if (startsAt && endsAt && endsAt.getTime() < startsAt.getTime()) fields.endsAt = "invalid";

  if (Object.keys(fields).length > 0 || !startsAt) {
    return { ok: false, fields };
  }

  return {
    ok: true,
    value: { title, details, location, link, startsAt, endsAt },
  };
}

export interface PartnerInput {
  name: string;
  summary: string;
  website: string;
  location: string;
}

export type PartnerFieldErrors = Partial<Record<"name" | "summary" | "website" | "location", "required" | "invalid" | "too_long">>;

export function parsePartner(
  source: unknown,
): { ok: true; value: PartnerInput } | { ok: false; fields: PartnerFieldErrors } {
  if (typeof source !== "object" || source === null) {
    return { ok: false, fields: { name: "required", summary: "required", website: "required" } };
  }
  const body = source as Record<string, unknown>;
  const fields: PartnerFieldErrors = {};
  const name = readText(body.name);
  const summary = readText(body.summary);
  const website = readText(body.website);
  const location = readText(body.location);

  if (!name) fields.name = "required";
  else if (name.length > TITLE_MAX) fields.name = "too_long";
  if (!summary) fields.summary = "required";
  else if (summary.length > TEXT_MAX) fields.summary = "too_long";
  if (!website) fields.website = "required";
  else if (!isHttpsUrl(website)) fields.website = "invalid";
  if (location.length > LOCATION_MAX) fields.location = "too_long";

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, value: { name, summary, website, location } };
}

export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export function youtubeEmbedUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.hostname === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (url.hostname === "www.youtube.com" || url.hostname === "youtube.com") {
      const id = url.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
