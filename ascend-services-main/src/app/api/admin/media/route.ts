import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth/guard";
import { ADMIN_ROLE } from "@/lib/auth/roles";
import { isHttpsUrl, youtubeEmbedUrl } from "@/lib/community/content";
import { log } from "@/lib/logger";
import { MediaStorageError, saveUploadedVideo } from "@/lib/media/storage";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 2000;

/** POST /api/admin/media — upload a video file or publish an https link. */
export async function POST(request: Request) {
  const guarded = await requireRole(ADMIN_ROLE);
  if (!guarded.ok) return guarded.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const title = readField(form.get("title"));
  const description = readField(form.get("description"));
  if (!title || title.length > TITLE_MAX) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  if (description.length > DESCRIPTION_MAX) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const link = readField(form.get("link"));
  const file = form.get("file");
  const hasFile = file instanceof File && file.size > 0;

  try {
    if (hasFile) {
      const source = await saveUploadedVideo(file);
      await prisma.mediaItem.create({
        data: { title, description, kind: "file", source },
      });
    } else if (link && isHttpsUrl(link) && (youtubeEmbedUrl(link) || link)) {
      await prisma.mediaItem.create({
        data: { title, description, kind: "link", source: link },
      });
    } else {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof MediaStorageError) {
      return NextResponse.json({ error: err.code }, { status: 400 });
    }
    log({
      level: "error",
      msg: "media_publish_failed",
      error: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "media_publish_failed" }, { status: 500 });
  }

  return NextResponse.json({ status: "saved" }, { status: 201 });
}

function readField(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}
