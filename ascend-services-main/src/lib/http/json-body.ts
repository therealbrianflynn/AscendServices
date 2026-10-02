/**
 * Reads a JSON object body, treating malformed JSON and non-object bodies
 * (arrays, `null`, bare scalars) alike: neither is something a handler can
 * destructure, so both become a single `null` the caller turns into a 400.
 */
export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown> | null> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  return parsed as Record<string, unknown>;
}
