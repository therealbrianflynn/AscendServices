import { InvalidEmailError, normalizeEmail } from "@/lib/auth/email-address";

const NAME_MAX = 80;
const BIO_MAX = 500;

export interface ServeApplication {
  name: string;
  email: string;
  services: string[];
  bio: string;
}

export type ServeField = "name" | "email" | "services" | "bio";
export type ServeFieldErrors = Partial<Record<ServeField, "required" | "invalid" | "too_long" | "unsupported">>;

export function parseServeApplication(
  source: unknown,
  allowedServices: readonly string[],
): { ok: true; value: ServeApplication } | { ok: false; fields: ServeFieldErrors } {
  if (typeof source !== "object" || source === null) {
    return { ok: false, fields: { name: "required", email: "required", services: "required" } };
  }

  const body = source as Record<string, unknown>;
  const fields: ServeFieldErrors = {};

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) fields.name = "required";
  else if (name.length > NAME_MAX) fields.name = "too_long";

  let email = "";
  try {
    email = normalizeEmail(body.email);
  } catch (err) {
    if (err instanceof InvalidEmailError) fields.email = "invalid";
    else throw err;
  }

  const services = parseServices(body.services, allowedServices);
  if (services === "required") fields.services = "required";
  else if (services === "unsupported") fields.services = "unsupported";

  const bio = typeof body.bio === "string" ? body.bio.trim() : "";
  if (bio.length > BIO_MAX) fields.bio = "too_long";

  if (Object.keys(fields).length > 0 || services === "required" || services === "unsupported") {
    return { ok: false, fields };
  }

  return { ok: true, value: { name, email, services, bio } };
}

function parseServices(
  value: unknown,
  allowed: readonly string[],
): string[] | "required" | "unsupported" {
  if (!Array.isArray(value) || value.length === 0) return "required";
  const chosen: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !allowed.includes(item)) return "unsupported";
    if (!chosen.includes(item)) chosen.push(item);
  }
  return chosen.length > 0 ? chosen : "required";
}
