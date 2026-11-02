import path from "node:path";

const ALLOWED_EXTENSIONS = new Set([".mp4", ".webm", ".mov"]);

/**
 * Accepts only a generated basename. Rejects path segments so a stored source
 * can never point outside the upload directory.
 */
export function isSafeMediaFilename(source: string): boolean {
  if (source !== path.basename(source)) return false;
  if (source.includes("..")) return false;
  const extension = path.extname(source).toLowerCase();
  return ALLOWED_EXTENSIONS.has(extension);
}

export function mediaContentType(filename: string): string {
  switch (path.extname(filename).toLowerCase()) {
    case ".webm":
      return "video/webm";
    case ".mov":
      return "video/quicktime";
    default:
      return "video/mp4";
  }
}
