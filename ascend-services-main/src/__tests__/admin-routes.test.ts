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

import { GET as getAdminRequests } from "@/app/api/admin/requests/route";
import {
  GET as getSlaSettings,
  PATCH as patchSlaSettings,
} from "@/app/api/admin/settings/sla/route";
import { GET as getAdminUsers } from "@/app/api/admin/users/route";
import { SESSION_COOKIE_NAME, signSession } from "@/lib/auth/session";
import { log } from "@/lib/logger";
import { SLA_SETTINGS_UPDATED_ACTION } from "@/lib/settings/sla-settings";

import {
  createFakePrisma,
  type FakeMemberRow,
  type FakePrisma,
  type FakeRequestRow,
} from "./helpers/fake-prisma";

const SECRET = process.env.AUTH_SESSION_SECRET as string;

/** The PII an admin may read on screen and that must never reach a log line. */
const STREET = "412 Harvest Lane";
const REQUESTER_EMAIL = "ruth@example.com";

const admin: FakeMemberRow = {
  id: "55555555-5555-4555-8555-555555555555",
  name: "Root Admin",
  email: "admin@ascend.test",
  role: "ADMIN",
  services_provided: [],
  bio: null,
  onboarding_token: "onboarding-secret",
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

/** Signs a cookie claiming ADMIN for an account the database says is SERVER. */
function signInWithStaleAdminCookie(member: FakeMemberRow) {
  signIn({ ...member, role: "ADMIN" });
}

function seedRequest(overrides: Partial<FakeRequestRow> = {}): FakeRequestRow {
  const index = db.requests.length + 1;
  const row: FakeRequestRow = {
    id: `req-${index}`,
    requester_name: "Ruth Boaz",
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
    createdAt: new Date("2026-03-01T10:00:00.000Z"),
    updatedAt: new Date("2026-03-01T10:00:00.000Z"),
    ...overrides,
  };
  db.requests.push(row);
  return row;
}

function patch(body: unknown, raw?: string) {
  return patchSlaSettings(
    new Request("http://localhost:3000/api/admin/settings/sla", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: raw ?? JSON.stringify(body),
    }),
  );
}

/** Everything the structured logger was handed during this test. */
function loggedText(): string {
  return JSON.stringify(vi.mocked(log).mock.calls);
}

beforeEach(() => {
  vi.clearAllMocks();
  db = createFakePrisma([admin, volunteer]);
  prismaProxy.holder.current = db.client as Record<string, unknown>;
  signIn(admin);
});

describe("GET /api/admin/requests", () => {
  it("returns every request with the coordination details an admin needs", async () => {
    seedRequest({ status: "ASSIGNED", assignedToId: volunteer.id });

    const response = await getAdminRequests();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      requests: [
        {
          id: "req-1",
          requester_name: "Ruth Boaz",
          requester_email: REQUESTER_EMAIL,
          service_type: "Yard work",
          neighborhood: "Eastside",
          street_address: STREET,
          status: "ASSIGNED",
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
          assignedAt: null,
          assignee: {
            id: volunteer.id,
            name: volunteer.name,
            email: volunteer.email,
          },
        },
      ],
    });
  });

  it("never writes requester PII to the structured log", async () => {
    seedRequest();

    await getAdminRequests();

    expect(loggedText()).not.toContain(STREET);
    expect(loggedText()).not.toContain(REQUESTER_EMAIL);
  });

  it("logs the failure reason only, never the rows, when the query fails", async () => {
    seedRequest();
    failRequestQuery(new Error("connection terminated"));

    const response = await getAdminRequests();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "admin_request_list_failed",
    });
    expect(loggedText()).toContain("connection terminated");
    expect(loggedText()).not.toContain(STREET);
  });

  it("forbids a SERVER session", async () => {
    seedRequest();
    signIn(volunteer);

    const response = await getAdminRequests();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
  });

  it("forbids a stale ADMIN cookie once the role was revoked in the database", async () => {
    signInWithStaleAdminCookie(volunteer);

    const response = await getAdminRequests();

    expect(response.status).toBe(403);
  });

  it("requires a session", async () => {
    signOut();

    const response = await getAdminRequests();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthenticated" });
  });
});

describe("GET /api/admin/users", () => {
  it("returns the member directory without any bearer credential", async () => {
    const response = await getAdminUsers();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = (await response.json()) as { users: Record<string, unknown>[] };
    expect(body.users).toHaveLength(2);
    expect(body.users.map((user) => user.email)).toContain(admin.email);
    for (const user of body.users) {
      expect(user).not.toHaveProperty("onboarding_token");
    }
    expect(JSON.stringify(body)).not.toContain("onboarding-secret");
  });

  it("forbids a SERVER session", async () => {
    signIn(volunteer);

    const response = await getAdminUsers();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
  });

  it("forbids a stale ADMIN cookie once the role was revoked in the database", async () => {
    signInWithStaleAdminCookie(volunteer);

    expect((await getAdminUsers()).status).toBe(403);
  });

  it("requires a session", async () => {
    signOut();

    expect((await getAdminUsers()).status).toBe(401);
  });
});

describe("GET /api/admin/settings/sla", () => {
  it("reports the seed defaults before anyone has saved", async () => {
    const response = await getSlaSettings();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      settings: {
        thresholds: {
          unassigned_alert_hours: 24,
          stalled_contact_alert_hours: 24,
          stalled_progress_days: 3,
        },
        updatedAt: null,
      },
    });
  });

  it("forbids a SERVER session", async () => {
    signIn(volunteer);

    const response = await getSlaSettings();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
  });

  it("requires a session", async () => {
    signOut();

    expect((await getSlaSettings()).status).toBe(401);
  });
});

describe("PATCH /api/admin/settings/sla", () => {
  it("saves the thresholds an admin edited and audits who did it", async () => {
    const response = await patch({
      unassigned_alert_hours: 12,
      stalled_progress_days: 5,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      settings: {
        thresholds: {
          unassigned_alert_hours: 12,
          // Untouched by this patch, so it keeps the seed default.
          stalled_contact_alert_hours: 24,
          stalled_progress_days: 5,
        },
        updatedAt: expect.any(String),
      },
    });
    expect(db.systemSettings).toHaveLength(1);
    expect(db.systemSettings[0].unassigned_alert_hours).toBe(12);
    expect(db.auditLogs).toEqual([
      expect.objectContaining({
        actorId: admin.id,
        action: SLA_SETTINGS_UPDATED_ACTION,
      }),
    ]);
  });

  it("rejects a threshold outside its bounds without saving anything", async () => {
    const response = await patch({ unassigned_alert_hours: 0 });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_thresholds",
      fields: { unassigned_alert_hours: "out_of_range" },
    });
    expect(db.systemSettings).toHaveLength(0);
  });

  it("rejects a body that names no threshold", async () => {
    const response = await patch({ stalled_progress_weeks: 2 });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "no_thresholds" });
    expect(db.systemSettings).toHaveLength(0);
  });

  it("rejects a malformed body", async () => {
    const response = await patch(null, "not json");

    expect(response.status).toBe(400);
    expect(db.systemSettings).toHaveLength(0);
  });

  it("forbids a SERVER session and leaves the thresholds alone", async () => {
    signIn(volunteer);

    const response = await patch({ unassigned_alert_hours: 1 });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
    expect(db.systemSettings).toHaveLength(0);
    expect(db.auditLogs).toHaveLength(0);
  });

  it("forbids a stale ADMIN cookie once the role was revoked in the database", async () => {
    signInWithStaleAdminCookie(volunteer);

    const response = await patch({ unassigned_alert_hours: 1 });

    expect(response.status).toBe(403);
    expect(db.systemSettings).toHaveLength(0);
  });

  it("requires a session before it reads the body", async () => {
    signOut();

    const response = await patch({ unassigned_alert_hours: 1 });

    expect(response.status).toBe(401);
    expect(db.systemSettings).toHaveLength(0);
  });
});

/** Replaces the request query with one that throws, as a dead database would. */
function failRequestQuery(error: Error): void {
  const client = db.client as { request: { findMany: () => Promise<never> } };
  client.request.findMany = () => Promise.reject(error);
}
