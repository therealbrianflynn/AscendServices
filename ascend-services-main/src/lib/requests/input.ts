import { InvalidEmailError, normalizeEmail } from "@/lib/auth/email-address";

import { getServiceTypeOptions } from "./service-types";

/**
 * Validation for the public Request Help form (Spec v6 §5). Shared by the API
 * route and the page so the browser and the server enforce one set of rules.
 *
 * Error messages never echo the submitted value: `street_address` is PII and
 * these messages travel through logs and HTTP responses.
 */
export const REQUEST_FIELD_MAX_LENGTHS = {
  requester_name: 120,
  /** RFC 5321 maximum; the column is optional, not the length. */
  requester_email: 254,
  service_type: 80,
  neighborhood: 120,
  street_address: 240,
  prayer_request: 2_000,
} as const;

export type HelpRequestField = keyof typeof REQUEST_FIELD_MAX_LENGTHS;

export type RequestFieldErrors = Partial<Record<HelpRequestField, string>>;

export interface HelpRequestInput {
  requester_name: string;
  /** Optional: only used to send the Spec v6 §4 connection email. */
  requester_email: string | null;
  service_type: string;
  neighborhood: string;
  street_address: string;
  prayer_request: string | null;
  /** When true the prayer text stays with admins only (form default). */
  prayer_private: boolean;
}

export class InvalidRequestInputError extends Error {
  readonly fieldErrors: RequestFieldErrors;

  constructor(fieldErrors: RequestFieldErrors) {
    super("invalid request input");
    this.name = "InvalidRequestInputError";
    this.fieldErrors = fieldErrors;
  }
}

export interface ParseHelpRequestOptions {
  /** Defaults to the configured catalogue; injectable for tests. */
  serviceTypes?: readonly string[];
}

export function parseHelpRequestInput(
  raw: unknown,
  { serviceTypes = getServiceTypeOptions() }: ParseHelpRequestOptions = {},
): HelpRequestInput {
  if (typeof raw !== "object" || raw === null) {
    throw new InvalidRequestInputError({ requester_name: "required" });
  }

  const source = raw as Record<string, unknown>;
  const fieldErrors: RequestFieldErrors = {};

  const requester_name = takeRequired(source, "requester_name", fieldErrors);
  const service_type = takeRequired(source, "service_type", fieldErrors);
  const neighborhood = takeRequired(source, "neighborhood", fieldErrors);
  const street_address = takeRequired(source, "street_address", fieldErrors);

  if (!fieldErrors.service_type && !serviceTypes.includes(service_type)) {
    fieldErrors.service_type = "unsupported";
  }

  const requester_email = takeOptionalEmail(source, fieldErrors);
  const prayer_request = takeOptional(source, "prayer_request", fieldErrors);
  const prayer_private = toBoolean(source.prayer_private, true);

  if (Object.keys(fieldErrors).length > 0) {
    throw new InvalidRequestInputError(fieldErrors);
  }

  return {
    requester_name,
    requester_email,
    service_type,
    neighborhood,
    street_address,
    prayer_request,
    // A blank prayer request has nothing to share, so the toggle is moot.
    prayer_private: prayer_request === null ? true : prayer_private,
  };
}

function takeRequired(
  source: Record<string, unknown>,
  field: HelpRequestField,
  fieldErrors: RequestFieldErrors,
): string {
  const value = normalizeText(source[field]);
  if (value.length === 0) {
    fieldErrors[field] = "required";
    return "";
  }
  if (value.length > REQUEST_FIELD_MAX_LENGTHS[field]) {
    fieldErrors[field] = "too_long";
    return "";
  }
  return value;
}

function takeOptional(
  source: Record<string, unknown>,
  field: HelpRequestField,
  fieldErrors: RequestFieldErrors,
): string | null {
  const value = normalizeText(source[field]);
  if (value.length === 0) return null;
  if (value.length > REQUEST_FIELD_MAX_LENGTHS[field]) {
    fieldErrors[field] = "too_long";
    return null;
  }
  return value;
}

/**
 * Optional contact address. A typo here costs the requester their connection
 * email, so a malformed value is rejected rather than stored and silently
 * dropped at send time.
 */
function takeOptionalEmail(
  source: Record<string, unknown>,
  fieldErrors: RequestFieldErrors,
): string | null {
  const value = normalizeText(source.requester_email);
  if (value.length === 0) return null;
  if (value.length > REQUEST_FIELD_MAX_LENGTHS.requester_email) {
    fieldErrors.requester_email = "too_long";
    return null;
  }
  try {
    return normalizeEmail(value);
  } catch (err) {
    if (!(err instanceof InvalidEmailError)) throw err;
    fieldErrors.requester_email = "invalid";
    return null;
  }
}

/** Collapses stray whitespace so duplicate detection and display stay sane. */
function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").trim();
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "on", "yes", "1"].includes(normalized)) return true;
    if (["false", "off", "no", "0"].includes(normalized)) return false;
  }
  return fallback;
}
