import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { log } from "@/lib/logger";
import { mediaContentType } from "@/lib/media/filenames";
import { resolveUploadedVideo } from "@/lib/media/storage";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** GET /api/media/[id] — stream a published video file. Links are not streamed. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const item = await prisma.mediaItem.findUnique({
      where: { id },
      select: { kind: true, source: true },
    });
    if (!item || item.kind !== "file") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const filePath = resolveUploadedVideo(item.source);
    if (!filePath) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const info = await stat(filePath);
    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
    return new Response(stream, {
      headers: {
        "content-type": mediaContentType(item.source),
        "content-length": String(info.size),
        "cache-control": "private, max-age=3600",
      },
    });
  } catch (err) {
    log({
      level: "error",
      msg: "media_stream_failed",
      error: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "media_unavailable" }, { status: 404 });
  }
}
