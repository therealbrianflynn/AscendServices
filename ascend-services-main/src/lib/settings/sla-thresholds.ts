/**
 * The Spec v6 §6 SLA monitoring thresholds, described once so the admin form,
 * the PATCH validator and the cron monitor all read the same contract.
 *
 * Units are hours / days to match the `SystemSettings` columns; `fallback`
 * mirrors the `@default(...)` in `prisma/schema.prisma` and is what the app
 * reports before an admin has ever saved the singleton row
 * (`src/__tests__/sla-settings.test.ts` asserts that parity).
 *
 * Nothing here is a secret or PII, so these values are safe to log.
 */

/** Keys of the editable `SystemSettings` columns. */
export const SLA_THRESHOLD_KEYS = [
  "unassigned_alert_hours",
  "stalled_contact_alert_hours",
  "stalled_progress_days",
] as const;

export type SlaThresholdKey = (typeof SLA_THRESHOLD_KEYS)[number];

export type SlaThresholdUnit = "hours" | "days";

export interface SlaThreshold {
  key: SlaThresholdKey;
  label: string;
  unit: SlaThresholdUnit;
  /** Admin-facing explanation of what breaching this threshold triggers. */
  description: string;
  /** Value used until the settings row exists; mirrors the Prisma default. */
  fallback: number;
  /** Inclusive bounds. A zero threshold would alert on every row forever. */
  min: number;
  max: number;
}

export const SLA_THRESHOLDS: readonly SlaThreshold[] = [
  {
    key: "unassigned_alert_hours",
    label: "Unassigned alert",
    unit: "hours",
    description:
      "How long a new request may sit on the board with no volunteer before admins are alerted.",
    fallback: 24,
    min: 1,
    max: 720,
  },
  {
    key: "stalled_contact_alert_hours",
    label: "Stalled contact alert",
    unit: "hours",
    description:
      "How long an assigned volunteer has to reach the requester before the request counts as stalled.",
    fallback: 24,
    min: 1,
    max: 720,
  },
  {
    key: "stalled_progress_days",
    label: "Stalled progress alert",
    unit: "days",
    description:
      "How long a request may stay in progress before admins check whether it needs help.",
    fallback: 3,
    min: 1,
    max: 90,
  },
];

const THRESHOLDS_BY_KEY = new Map(
  SLA_THRESHOLDS.map((threshold) => [threshold.key, threshold]),
);

export type SlaSettings = Record<SlaThresholdKey, number>;

export interface SlaSettingsView {
  thresholds: SlaSettings;
  /**
   * When the singleton row was last written, or `null` while the app is still
   * running on the schema defaults — an admin needs to tell those apart.
   */
  updatedAt: string | null;
}

export function slaThreshold(key: SlaThresholdKey): SlaThreshold {
  const threshold = THRESHOLDS_BY_KEY.get(key);
  if (!threshold) {
    throw new Error(`Unknown SLA threshold "${key}"`);
  }
  return threshold;
}

export function isSlaThresholdKey(value: unknown): value is SlaThresholdKey {
  return (
    typeof value === "string" &&
    (SLA_THRESHOLD_KEYS as readonly string[]).includes(value)
  );
}

/** The thresholds in force before any admin edit. */
export function defaultSlaSettings(): SlaSettings {
  return Object.fromEntries(
    SLA_THRESHOLDS.map((threshold) => [threshold.key, threshold.fallback]),
  ) as SlaSettings;
}
