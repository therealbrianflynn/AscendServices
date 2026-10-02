import { log } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import {
  defaultSlaSettings,
  type SlaSettings,
  type SlaSettingsView,
} from "./sla-thresholds";

export const SLA_SETTINGS_UPDATED_ACTION = "SLA_SETTINGS_UPDATED";

/**
 * `SystemSettings` is a singleton (Spec v6 §6): one set of thresholds for the
 * whole ministry, on a fixed primary key so there is nothing to choose between.
 */
export const SLA_SETTINGS_ID = "default";

/** Audit metadata marker: this edit came from the admin console. */
const ADMIN_CONSOLE_SOURCE = "admin_console";

/**
 * Every column the SLA surface reads. Listed explicitly (rather than derived)
 * because Prisma needs a literal select; `src/__tests__/sla-settings.test.ts`
 * asserts it covers every threshold key.
 */
export const SLA_SETTINGS_SELECT = {
  unassigned_alert_hours: true,
  stalled_contact_alert_hours: true,
  stalled_progress_days: true,
  updatedAt: true,
} as const;

export interface SlaSettingsRecord extends SlaSettings {
  updatedAt: Date;
}

export interface SaveSlaSettingsInput {
  /** Any subset of the thresholds; the rest keep their current value. */
  patch: Partial<SlaSettings>;
  /** The ADMIN making the change — the audit trail's only actor. */
  actorId: string;
}

/**
 * Current thresholds. The row is created lazily on first save, so a fresh
 * install reports the schema defaults with `updatedAt: null` rather than
 * failing or pretending someone configured them.
 */
export async function readSlaSettings(): Promise<SlaSettingsView> {
  const record = await prisma.systemSettings.findUnique({
    where: { id: SLA_SETTINGS_ID },
    select: SLA_SETTINGS_SELECT,
  });

  return toSlaSettingsView(record);
}

/**
 * Applies an admin edit. The upsert and its audit row share one transaction:
 * an unattributed threshold change is exactly the kind of edit Spec v6 §6
 * expects to be able to explain afterwards.
 */
export async function saveSlaSettings({
  patch,
  actorId,
}: SaveSlaSettingsInput): Promise<SlaSettingsView> {
  const changed = Object.keys(patch);

  const record = await prisma.$transaction(async (tx) => {
    const current = await tx.systemSettings.findUnique({
      where: { id: SLA_SETTINGS_ID },
      select: SLA_SETTINGS_SELECT,
    });

    const thresholds: SlaSettings = {
      ...toSlaSettingsView(current).thresholds,
      ...patch,
    };

    const saved = await tx.systemSettings.upsert({
      where: { id: SLA_SETTINGS_ID },
      create: { id: SLA_SETTINGS_ID, ...thresholds },
      update: thresholds,
      select: SLA_SETTINGS_SELECT,
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: SLA_SETTINGS_UPDATED_ACTION,
        metadata: { source: ADMIN_CONSOLE_SOURCE, changed, ...thresholds },
      },
    });

    return saved;
  });

  const view = toSlaSettingsView(record);

  log({
    msg: "sla_settings_updated",
    action: SLA_SETTINGS_UPDATED_ACTION,
    actorId,
    changed,
    ...view.thresholds,
  });

  return view;
}

export function toSlaSettingsView(
  record: SlaSettingsRecord | null,
): SlaSettingsView {
  if (!record) {
    return { thresholds: defaultSlaSettings(), updatedAt: null };
  }

  const { updatedAt, ...thresholds } = record;
  return { thresholds, updatedAt: updatedAt.toISOString() };
}
