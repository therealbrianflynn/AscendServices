import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { isSafeMediaFilename } from "./filenames";

const MAX_BYTES = 25 * 1024 * 1024;

const TYPES = new Map<string, string>([
  ["video/mp4", ".mp4"],
  ["video/webm", ".webm"],
  ["video/quicktime", ".mov"],
]);

export class MediaStorageError extends Error {
  readonly code: "unsupported_type" | "too_large" | "empty" | "invalid_name";

  constructor(code: MediaStorageError["code"]) {
    super(code);
    this.name = "MediaStorageError";
    this.code = code;
  }
}

export function mediaUploadDir(): string {
  return process.env.MEDIA_UPLOAD_DIR || path.join(process.cwd(), "uploads");
}

export async function saveUploadedVideo(file: File): Promise<string> {
  const extension = TYPES.get(file.type);
  if (!extension) throw new MediaStorageError("unsupported_type");
  if (file.size <= 0) throw new MediaStorageError("empty");
  if (file.size > MAX_BYTES) throw new MediaStorageError("too_large");

  const filename = `${randomUUID()}${extension}`;
  if (!isSafeMediaFilename(filename)) throw new MediaStorageError("invalid_name");

  const directory = path.resolve(mediaUploadDir());
  await mkdir(directory, { recursive: true });
  const target = path.resolve(directory, filename);
  if (!target.startsWith(`${directory}${path.sep}`)) {
    throw new MediaStorageError("invalid_name");
  }

  await writeFile(target, Buffer.from(await file.arrayBuffer()));
  return filename;
}

export function resolveUploadedVideo(source: string): string | null {
  if (!isSafeMediaFilename(source)) return null;
  const directory = path.resolve(mediaUploadDir());
  const target = path.resolve(directory, source);
  if (!target.startsWith(`${directory}${path.sep}`)) return null;
  return target;
}
