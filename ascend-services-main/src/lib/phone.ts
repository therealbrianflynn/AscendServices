/**
 * A phone number people can actually dial. Stored as the person typed it,
 * after trimming, so "(317) 555-0100" stays readable.
 */
const PHONE_MAX = 20;
const PHONE_CHARS = /^[0-9+().\-\s]+$/;
const MIN_DIGITS = 7;

export type PhoneParseFailure = "invalid" | "too_long";

export function parseOptionalPhone(
  value: unknown,
): { ok: true; phone: string | null } | { ok: false; reason: PhoneParseFailure } {
  if (value == null) return { ok: true, phone: null };
  if (typeof value !== "string") return { ok: false, reason: "invalid" };

  const phone = value.trim();
  if (phone.length === 0) return { ok: true, phone: null };
  if (phone.length > PHONE_MAX) return { ok: false, reason: "too_long" };

  const digits = phone.replace(/\D/g, "");
  if (digits.length < MIN_DIGITS || !PHONE_CHARS.test(phone)) {
    return { ok: false, reason: "invalid" };
  }

  return { ok: true, phone };
}
