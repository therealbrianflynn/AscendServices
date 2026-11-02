const NEXT_MAX = 200;

/**
 * Accepts only a same-site path. Rejects protocol-relative and off-site values
 * so a sign-in return target cannot be used as an open redirect.
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (path.length === 0 || path.length > NEXT_MAX) return null;
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return null;
  if (path.includes("\\") || path.includes("://") || /[\u0000-\u001f\s]/.test(path)) return null;
  return path;
}

export const AFTER_LOGIN_COOKIE = "ascend_next";
