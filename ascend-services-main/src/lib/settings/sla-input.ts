import {
  SLA_THRESHOLDS,
  type SlaSettings,
  type SlaThresholdKey,
} from "./sla-thresholds";

/**
 * Validation for an admin SLA threshold edit. A patch may carry any subset of
 * the thresholds, but every value it does carry must be a whole number inside
 * that threshold's bounds: a `0` or a negative would turn the cron monitor into
 * a pager that never stops (or never fires).
 *
 * Rejections are stable codes rather than prose so the API contract and the
 * admin form copy can evolve independently.
 */
export type SlaFieldError = "not_a_number" | "not_an_integer" | "out_of_range";

export type SlaFieldErrors = Partial<Record<SlaThresholdKey, SlaFieldError>>;

export type ParseSlaSettingsPatchResult =
  | { ok: true; patch: Partial<SlaSettings> }
  /** The body named none of the thresholds, so there is nothing to save. */
  | { ok: false; error: "no_thresholds" }
  | { ok: false; error: "invalid_thresholds"; fields: SlaFieldErrors };

export function parseSlaSettingsPatch(raw: unknown): ParseSlaSettingsPatchResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "no_thresholds" };
  }

  const source = raw as Record<string, unknown>;
  const patch: Partial<SlaSettings> = {};
  const fields: SlaFieldErrors = {};

  for (const threshold of SLA_THRESHOLDS) {
    const value = source[threshold.key];
    if (value === undefined || value === null || value === "") continue;

    const parsed = toNumber(value);
    if (parsed === null) {
      fields[threshold.key] = "not_a_number";
      continue;
    }
    if (!Number.isInteger(parsed)) {
      fields[threshold.key] = "not_an_integer";
      continue;
    }
    if (parsed < threshold.min || parsed > threshold.max) {
      fields[threshold.key] = "out_of_range";
      continue;
    }
    patch[threshold.key] = parsed;
  }

  if (Object.keys(fields).length > 0) {
    return { ok: false, error: "invalid_thresholds", fields };
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "no_thresholds" };
  }
  return { ok: true, patch };
}

/** Accepts the JSON number the form sends and the string a curl user sends. */
function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  return Number(trimmed);
}
