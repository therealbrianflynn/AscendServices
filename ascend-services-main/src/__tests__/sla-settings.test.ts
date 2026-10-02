import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaProxy = vi.hoisted(() => {
  const holder: { current: Record<string | symbol, unknown> | null } = { current: null };
  return {
    holder,
    proxy: new Proxy(
      {},
      {
        get: (_target, property) => holder.current?.[property],
      },
    ),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaProxy.proxy }));
vi.mock("@/lib/logger", () => ({ log: vi.fn() }));

import { log } from "@/lib/logger";
import { parseSlaSettingsPatch } from "@/lib/settings/sla-input";
import {
  SLA_SETTINGS_ID,
  SLA_SETTINGS_SELECT,
  SLA_SETTINGS_UPDATED_ACTION,
  readSlaSettings,
  saveSlaSettings,
} from "@/lib/settings/sla-settings";
import {
  SLA_THRESHOLDS,
  SLA_THRESHOLD_KEYS,
  defaultSlaSettings,
  isSlaThresholdKey,
  slaThreshold,
} from "@/lib/settings/sla-thresholds";

import { createFakePrisma, type FakePrisma } from "./helpers/fake-prisma";

const schema = readFileSync(path.join(__dirname, "../../prisma/schema.prisma"), "utf8");

const ACTOR = "55555555-5555-4555-8555-555555555555";

let db: FakePrisma;

beforeEach(() => {
  vi.clearAllMocks();
  db = createFakePrisma();
  prismaProxy.holder.current = db.client as Record<string, unknown>;
});

describe("SLA threshold contract", () => {
  it("names exactly the editable SystemSettings columns", () => {
    const body = schema.match(/model SystemSettings \{([^}]*)\}/)?.[1];
    expect(body).toBeDefined();

    const intColumns = [...body!.matchAll(/^\s*(\w+)\s+Int\s+@default\((\d+)\)/gm)];
    expect(intColumns.map(([, column]) => column)).toEqual([...SLA_THRESHOLD_KEYS]);
  });

  it("falls back to the Prisma defaults", () => {
    const body = schema.match(/model SystemSettings \{([^}]*)\}/)?.[1];
    const schemaDefaults = Object.fromEntries(
      [...body!.matchAll(/^\s*(\w+)\s+Int\s+@default\((\d+)\)/gm)].map(
        ([, column, value]) => [column, Number(value)],
      ),
    );

    expect(defaultSlaSettings()).toEqual(schemaDefaults);
  });

  it("selects every threshold it can edit", () => {
    for (const key of SLA_THRESHOLD_KEYS) {
      expect(SLA_SETTINGS_SELECT).toHaveProperty(key, true);
    }
  });

  it("keeps the Spec v6 hours / days units", () => {
    expect(slaThreshold("unassigned_alert_hours").unit).toBe("hours");
    expect(slaThreshold("stalled_contact_alert_hours").unit).toBe("hours");
    expect(slaThreshold("stalled_progress_days").unit).toBe("days");
  });

  it("describes bounds that exclude a threshold of zero", () => {
    for (const threshold of SLA_THRESHOLDS) {
      expect(threshold.min).toBeGreaterThan(0);
      expect(threshold.max).toBeGreaterThan(threshold.min);
      expect(threshold.fallback).toBeGreaterThanOrEqual(threshold.min);
      expect(threshold.fallback).toBeLessThanOrEqual(threshold.max);
    }
  });

  it("recognises only known threshold keys", () => {
    expect(isSlaThresholdKey("stalled_progress_days")).toBe(true);
    expect(isSlaThresholdKey("stalled_progress_weeks")).toBe(false);
    expect(() => slaThreshold("nope" as never)).toThrow(/threshold/i);
  });
});

describe("parseSlaSettingsPatch", () => {
  it("accepts a partial patch", () => {
    expect(parseSlaSettingsPatch({ unassigned_alert_hours: 8 })).toEqual({
      ok: true,
      patch: { unassigned_alert_hours: 8 },
    });
  });

  it("accepts the numeric strings a form submits", () => {
    expect(parseSlaSettingsPatch({ stalled_progress_days: "7" })).toEqual({
      ok: true,
      patch: { stalled_progress_days: 7 },
    });
  });

  it("ignores keys it does not own", () => {
    expect(
      parseSlaSettingsPatch({ unassigned_alert_hours: 8, id: "attacker", role: "ADMIN" }),
    ).toEqual({ ok: true, patch: { unassigned_alert_hours: 8 } });
  });

  it("rejects a body with nothing to save", () => {
    for (const body of [{}, { stalled_progress_weeks: 2 }, null, [], "12"]) {
      expect(parseSlaSettingsPatch(body)).toEqual({
        ok: false,
        error: "no_thresholds",
      });
    }
  });

  it("rejects values the SLA monitor could not use", () => {
    expect(
      parseSlaSettingsPatch({
        unassigned_alert_hours: 0,
        stalled_contact_alert_hours: 1.5,
        stalled_progress_days: "soon",
      }),
    ).toEqual({
      ok: false,
      error: "invalid_thresholds",
      fields: {
        unassigned_alert_hours: "out_of_range",
        stalled_contact_alert_hours: "not_an_integer",
        stalled_progress_days: "not_a_number",
      },
    });
  });

  it("rejects a threshold above its ceiling", () => {
    const { max } = slaThreshold("stalled_progress_days");

    expect(parseSlaSettingsPatch({ stalled_progress_days: max + 1 })).toEqual({
      ok: false,
      error: "invalid_thresholds",
      fields: { stalled_progress_days: "out_of_range" },
    });
  });
});

describe("readSlaSettings", () => {
  it("reports the defaults, and no save date, until the row exists", async () => {
    await expect(readSlaSettings()).resolves.toEqual({
      thresholds: defaultSlaSettings(),
      updatedAt: null,
    });
    expect(db.systemSettings).toHaveLength(0);
  });

  it("reports what was saved", async () => {
    await saveSlaSettings({ patch: { unassigned_alert_hours: 6 }, actorId: ACTOR });

    const view = await readSlaSettings();

    expect(view.thresholds.unassigned_alert_hours).toBe(6);
    expect(view.updatedAt).toEqual(expect.any(String));
  });
});

describe("saveSlaSettings", () => {
  it("creates the singleton row on the first edit", async () => {
    const view = await saveSlaSettings({
      patch: { stalled_progress_days: 5 },
      actorId: ACTOR,
    });

    expect(db.systemSettings).toHaveLength(1);
    expect(db.systemSettings[0].id).toBe(SLA_SETTINGS_ID);
    expect(view.thresholds).toEqual({ ...defaultSlaSettings(), stalled_progress_days: 5 });
  });

  it("leaves the thresholds the patch did not name alone", async () => {
    await saveSlaSettings({ patch: { unassigned_alert_hours: 6 }, actorId: ACTOR });

    const view = await saveSlaSettings({
      patch: { stalled_progress_days: 9 },
      actorId: ACTOR,
    });

    expect(view.thresholds).toEqual({
      unassigned_alert_hours: 6,
      stalled_contact_alert_hours:
        defaultSlaSettings().stalled_contact_alert_hours,
      stalled_progress_days: 9,
    });
    expect(db.systemSettings).toHaveLength(1);
  });

  it("audits the actor, the changed keys and the resulting thresholds", async () => {
    await saveSlaSettings({ patch: { unassigned_alert_hours: 6 }, actorId: ACTOR });

    expect(db.auditLogs).toEqual([
      expect.objectContaining({
        actorId: ACTOR,
        action: SLA_SETTINGS_UPDATED_ACTION,
        metadata: {
          source: "admin_console",
          changed: ["unassigned_alert_hours"],
          ...defaultSlaSettings(),
          unassigned_alert_hours: 6,
        },
      }),
    ]);
  });

  it("does not save the thresholds when the audit row fails", async () => {
    db.failNextAuditCreate(new Error("audit unavailable"));

    await expect(
      saveSlaSettings({ patch: { unassigned_alert_hours: 6 }, actorId: ACTOR }),
    ).rejects.toThrow(/audit unavailable/);
    expect(db.systemSettings).toHaveLength(0);
  });

  it("logs the change with no secrets to leak", async () => {
    await saveSlaSettings({ patch: { unassigned_alert_hours: 6 }, actorId: ACTOR });

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "sla_settings_updated",
        action: SLA_SETTINGS_UPDATED_ACTION,
        actorId: ACTOR,
        unassigned_alert_hours: 6,
      }),
    );
  });
});
