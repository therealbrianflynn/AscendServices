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
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/logger", () => ({ log: vi.fn() }));

import { cookies } from "next/headers";

import { POST as runSlaMonitorRoute } from "@/app/api/admin/sla/monitor/route";
import { SESSION_COOKIE_NAME, signSession } from "@/lib/auth/session";
import { log } from "@/lib/logger";
import { saveSlaSettings } from "@/lib/settings/sla-settings";
import { defaultSlaSettings } from "@/lib/settings/sla-thresholds";
import { SLA_CHECKS, cutoffFor, thresholdHours } from "@/lib/sla/checks";
import { SLA_BREACH_ACTION, runSlaMonitor } from "@/lib/sla/monitor";
import { SLA_ALERT_EMAIL_TEMPLATE, slaAlertSubject } from "@/lib/sla/notify";

import {
  createFakePrisma,
  type FakeMemberRow,
  type FakePrisma,
  type FakeRequestRow,
} from "./helpers/fake-prisma";

const SECRET = process.env.AUTH_SESSION_SECRET as string;

/** Fake clock: every fixture is aged relative to this instant, never to now. */
const NOW = new Date("2026-03-10T12:00:00.000Z");

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const defaults = defaultSlaSettings();

/** The PII the monitor must never fetch, let alone log or email. */
const STREET = "412 Harvest Lane";
const REQUESTER_NAME = "Ruth Boaz";
const REQUESTER_EMAIL = "ruth@example.com";

const admin: FakeMemberRow = {
  id: "55555555-5555-4555-8555-555555555555",
  name: "Root Admin",
  email: "admin@ascend.test",
  role: "ADMIN",
  services_provided: [],
  bio: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

const volunteer: FakeMemberRow = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Boaz Elimelech",
  email: "boaz@ascend.test",
  role: "SERVER",
  services_provided: ["Yard work"],
  bio: "Retired landscaper.",
  createdAt: new Date("2026-02-01T00:00:00.000Z"),
};

let db: FakePrisma;

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * HOUR);
}

function seedRequest(overrides: Partial<FakeRequestRow> = {}): FakeRequestRow {
  const index = db.requests.length + 1;
  const createdAt = overrides.createdAt ?? hoursAgo(1);
  const row: FakeRequestRow = {
    id: `req-${index}`,
    requester_name: REQUESTER_NAME,
    requester_email: REQUESTER_EMAIL,
    service_type: "Yard work",
    neighborhood: "Eastside",
    street_address: STREET,
    prayer_request: "Please pray for my knee.",
    prayer_private: true,
    status: "NEW",
    assignedToId: null,
    assignedAt: null,
    tracking_token: `token-${index}`,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
  db.requests.push(row);
  return row;
}

/** A NEW request that has been waiting longer than the unassigned threshold. */
function seedOverdueNewRequest(
  ageHours = defaults.unassigned_alert_hours + 6,
): FakeRequestRow {
  return seedRequest({ status: "NEW", createdAt: hoursAgo(ageHours) });
}

function signIn(member: FakeMemberRow) {
  const cookie = signSession(
    { sub: member.id, email: member.email, role: member.role as "SERVER" | "ADMIN" },
    SECRET,
    24,
  );
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      name === SESSION_COOKIE_NAME ? { name, value: cookie } : undefined,
  } as never);
}

function signOut() {
  vi.mocked(cookies).mockResolvedValue({ get: () => undefined } as never);
}

/** Everything the structured logger was handed during this test. */
function loggedText(): string {
  return JSON.stringify(vi.mocked(log).mock.calls);
}

function breachLines(): Record<string, unknown>[] {
  return vi
    .mocked(log)
    .mock.calls.map(([fields]) => fields as Record<string, unknown>)
    .filter((fields) => fields.msg === "sla_breach");
}

beforeEach(() => {
  vi.clearAllMocks();
  db = createFakePrisma([admin, volunteer]);
  prismaProxy.holder.current = db.client as Record<string, unknown>;
  signIn(admin);
});

describe("SLA check contract", () => {
  it("covers every editable threshold exactly once", () => {
    expect(SLA_CHECKS.map((check) => check.thresholdKey).sort()).toEqual(
      Object.keys(defaults).sort(),
    );
  });

  it("converts a threshold in days into hours", () => {
    const progress = SLA_CHECKS.find((check) => check.key === "stalled_progress")!;

    expect(thresholdHours(progress, defaults)).toBe(defaults.stalled_progress_days * 24);
  });

  it("puts the cutoff exactly one threshold behind the clock", () => {
    const unassigned = SLA_CHECKS.find((check) => check.key === "unassigned")!;

    expect(cutoffFor(unassigned, defaults, NOW)).toEqual(
      hoursAgo(defaults.unassigned_alert_hours),
    );
  });
});

describe("runSlaMonitor — overdue NEW requests", () => {
  it("emits an SLA_BREACH log line naming the request and the threshold", async () => {
    const overdue = seedOverdueNewRequest(30);

    const report = await runSlaMonitor({ now: NOW });

    expect(report.breaches).toEqual([
      {
        requestId: overdue.id,
        check: "unassigned",
        status: "NEW",
        threshold_key: "unassigned_alert_hours",
        threshold: defaults.unassigned_alert_hours,
        unit: "hours",
        age_hours: 30,
        overdue_hours: 30 - defaults.unassigned_alert_hours,
        service_type: "Yard work",
        neighborhood: "Eastside",
        since: overdue.createdAt.toISOString(),
      },
    ]);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "warn",
        msg: "sla_breach",
        action: SLA_BREACH_ACTION,
        requestId: overdue.id,
        threshold_key: "unassigned_alert_hours",
        threshold: defaults.unassigned_alert_hours,
      }),
    );
  });

  it("records the breach in the audit trail against the stuck status", async () => {
    const overdue = seedOverdueNewRequest();

    await runSlaMonitor({ now: NOW });

    expect(db.auditLogs).toEqual([
      expect.objectContaining({
        requestId: overdue.id,
        action: SLA_BREACH_ACTION,
        fromStatus: "NEW",
        metadata: expect.objectContaining({
          source: "sla_monitor",
          check: "unassigned",
          threshold_key: "unassigned_alert_hours",
          threshold: defaults.unassigned_alert_hours,
        }),
      }),
    ]);
  });

  it("leaves a request that is still inside the threshold alone", async () => {
    seedRequest({
      status: "NEW",
      createdAt: hoursAgo(defaults.unassigned_alert_hours - 1),
    });

    const report = await runSlaMonitor({ now: NOW });

    expect(report.breaches).toEqual([]);
    expect(breachLines()).toEqual([]);
    expect(db.auditLogs).toEqual([]);
  });

  it("ignores requests a volunteer has already claimed", async () => {
    seedRequest({
      status: "ASSIGNED",
      createdAt: hoursAgo(200),
      assignedAt: hoursAgo(1),
      assignedToId: volunteer.id,
    });

    await expect(runSlaMonitor({ now: NOW })).resolves.toMatchObject({ breaches: [] });
  });

  it("uses the thresholds an admin saved, not the seed defaults", async () => {
    await saveSlaSettings({ patch: { unassigned_alert_hours: 4 }, actorId: admin.id });
    seedRequest({ status: "NEW", createdAt: hoursAgo(6) });

    const report = await runSlaMonitor({ now: NOW });

    expect(report.thresholds.unassigned_alert_hours).toBe(4);
    expect(report.breaches).toHaveLength(1);
    expect(report.breaches[0]).toMatchObject({ threshold: 4, overdue_hours: 2 });
  });

  it("alerts once per request, however often the cron runs", async () => {
    seedOverdueNewRequest();

    const first = await runSlaMonitor({ now: NOW });
    const second = await runSlaMonitor({ now: new Date(NOW.getTime() + HOUR) });

    expect(first.alerted).toHaveLength(1);
    expect(second.alerted).toHaveLength(0);
    expect(second.breaches).toHaveLength(1);
    expect(second.suppressed).toBe(1);
    expect(breachLines()).toHaveLength(1);
    expect(db.auditLogs).toHaveLength(1);
  });
});

describe("runSlaMonitor — stalled requests", () => {
  it("flags an assigned volunteer who has not made contact", async () => {
    const stalled = seedRequest({
      status: "ASSIGNED",
      assignedToId: volunteer.id,
      createdAt: hoursAgo(80),
      assignedAt: hoursAgo(defaults.stalled_contact_alert_hours + 2),
    });

    const report = await runSlaMonitor({ now: NOW });

    expect(report.breaches).toEqual([
      expect.objectContaining({
        requestId: stalled.id,
        check: "stalled_contact",
        status: "ASSIGNED",
        threshold_key: "stalled_contact_alert_hours",
        overdue_hours: 2,
        since: stalled.assignedAt!.toISOString(),
      }),
    ]);
  });

  it("skips an assigned request with no assignment clock to measure", async () => {
    seedRequest({
      status: "ASSIGNED",
      assignedToId: volunteer.id,
      createdAt: hoursAgo(300),
      assignedAt: null,
    });

    await expect(runSlaMonitor({ now: NOW })).resolves.toMatchObject({ breaches: [] });
  });

  it("flags a request that has sat in progress past the day threshold", async () => {
    const stalled = seedRequest({
      status: "IN_PROGRESS",
      assignedToId: volunteer.id,
      createdAt: hoursAgo(20 * 24),
      assignedAt: hoursAgo(19 * 24),
      updatedAt: new Date(NOW.getTime() - (defaults.stalled_progress_days + 1) * DAY),
    });

    const report = await runSlaMonitor({ now: NOW });

    expect(report.breaches).toEqual([
      expect.objectContaining({
        requestId: stalled.id,
        check: "stalled_progress",
        status: "IN_PROGRESS",
        threshold_key: "stalled_progress_days",
        unit: "days",
        threshold: defaults.stalled_progress_days,
        overdue_hours: 24,
      }),
    ]);
  });

  it("never flags a completed request", async () => {
    seedRequest({
      status: "COMPLETE",
      createdAt: hoursAgo(400),
      updatedAt: hoursAgo(400),
    });

    await expect(runSlaMonitor({ now: NOW })).resolves.toMatchObject({ breaches: [] });
  });

  it("reports every stuck state in one pass", async () => {
    seedOverdueNewRequest();
    seedRequest({
      status: "ASSIGNED",
      assignedToId: volunteer.id,
      assignedAt: hoursAgo(defaults.stalled_contact_alert_hours + 1),
    });
    seedRequest({
      status: "IN_PROGRESS",
      assignedToId: volunteer.id,
      updatedAt: new Date(NOW.getTime() - (defaults.stalled_progress_days + 2) * DAY),
    });

    const report = await runSlaMonitor({ now: NOW });

    expect(report.breaches.map((breach) => breach.check)).toEqual([
      "unassigned",
      "stalled_contact",
      "stalled_progress",
    ]);
  });
});

describe("runSlaMonitor — privacy", () => {
  it("keeps requester PII out of every line it writes", async () => {
    seedOverdueNewRequest();

    await runSlaMonitor({ now: NOW });

    expect(breachLines()).toHaveLength(1);
    expect(loggedText()).not.toContain(STREET);
    expect(loggedText()).not.toContain(REQUESTER_NAME);
    expect(loggedText()).not.toContain(REQUESTER_EMAIL);
    expect(loggedText()).not.toContain("token-1");
    expect(loggedText()).not.toContain("knee");
  });

  it("never fetches the private columns in the first place", async () => {
    seedOverdueNewRequest();

    await runSlaMonitor({ now: NOW });

    for (const line of breachLines()) {
      expect(line).not.toHaveProperty("street_address");
      expect(line).not.toHaveProperty("requester_name");
      expect(line).not.toHaveProperty("requester_email");
    }
  });

  it("keeps requester PII out of the audit metadata", async () => {
    seedOverdueNewRequest();

    await runSlaMonitor({ now: NOW });

    expect(JSON.stringify(db.auditLogs)).not.toContain(STREET);
    expect(JSON.stringify(db.auditLogs)).not.toContain(REQUESTER_EMAIL);
  });
});

describe("runSlaMonitor — admin notification", () => {
  it("sends one PII-free digest to the admins", async () => {
    const overdue = seedOverdueNewRequest();

    const report = await runSlaMonitor({ now: NOW });

    expect(report.notification).toBe("sent");
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "email_sent",
        template: SLA_ALERT_EMAIL_TEMPLATE,
        to: admin.email,
        subject: slaAlertSubject(1),
      }),
    );
    expect(loggedText()).toContain(overdue.id);
    expect(loggedText()).not.toContain(STREET);
  });

  it("stays quiet when nothing is overdue", async () => {
    seedRequest({ status: "NEW", createdAt: hoursAgo(1) });

    const report = await runSlaMonitor({ now: NOW });

    expect(report.notification).toBe("skipped_no_new_breaches");
    expect(loggedText()).not.toContain(SLA_ALERT_EMAIL_TEMPLATE);
  });

  it("still audits and logs the breach when there is no admin to email", async () => {
    db = createFakePrisma([volunteer]);
    prismaProxy.holder.current = db.client as Record<string, unknown>;
    const overdue = seedOverdueNewRequest();

    const report = await runSlaMonitor({ now: NOW });

    expect(report.notification).toBe("skipped_no_admins");
    expect(report.alerted).toHaveLength(1);
    expect(db.auditLogs).toEqual([
      expect.objectContaining({ requestId: overdue.id, action: SLA_BREACH_ACTION }),
    ]);
  });
});

describe("POST /api/admin/sla/monitor", () => {
  it("runs a pass for an admin and reports what it found", async () => {
    const overdue = seedOverdueNewRequest();

    const response = await runSlaMonitorRoute();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as {
      breaches: { requestId: string }[];
      thresholds: Record<string, number>;
    };
    expect(body.breaches.map((breach) => breach.requestId)).toEqual([overdue.id]);
    expect(body.thresholds).toEqual(defaults);
    expect(JSON.stringify(body)).not.toContain(STREET);
  });

  it("forbids a SERVER session and runs nothing", async () => {
    seedOverdueNewRequest();
    signIn(volunteer);

    const response = await runSlaMonitorRoute();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
    expect(db.auditLogs).toEqual([]);
  });

  it("requires a session", async () => {
    seedOverdueNewRequest();
    signOut();

    const response = await runSlaMonitorRoute();

    expect(response.status).toBe(401);
    expect(db.auditLogs).toEqual([]);
  });

  it("reports a failed pass without leaking a row", async () => {
    seedOverdueNewRequest();
    failRequestQuery(new Error("connection terminated"));

    const response = await runSlaMonitorRoute();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "sla_monitor_failed" });
    expect(loggedText()).toContain("connection terminated");
    expect(loggedText()).not.toContain(STREET);
  });
});

/** Replaces the request query with one that throws, as a dead database would. */
function failRequestQuery(error: Error): void {
  const client = db.client as { request: { findMany: () => Promise<never> } };
  client.request.findMany = () => Promise.reject(error);
}
