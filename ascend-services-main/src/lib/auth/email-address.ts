/**
 * Email normalisation shared by the magic-link flow and the ADMIN seed script.
 * Imported with relative paths only so it can run outside the Next.js bundler.
 */
export class InvalidEmailError extends Error {
  constructor(message = "invalid email address") {
    super(message);
    this.name = "InvalidEmailError";
  }
}

// Deliberately conservative: one @, a dotted domain, no whitespace.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const MAX_EMAIL_LENGTH = 254;

export function normalizeEmail(raw: unknown): string {
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    throw new InvalidEmailError();
  }
  return email;
}

export function displayNameFor(name: unknown, email: string): string {
  const supplied = typeof name === "string" ? name.trim() : "";
  return supplied.length > 0 ? supplied : email.split("@")[0];
}
