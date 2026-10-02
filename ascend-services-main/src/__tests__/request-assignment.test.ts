import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import {
  CONNECTION_EMAIL_ACTION,
  REQUEST_ASSIGNED_ACTION,
  assignRequestToVolunteer,
} from "@/lib/requests/assignment";

import {
  createFakePrisma,
  type FakeMemberRow,
  type FakePrisma,
  type FakeRequestRow,
} from "./helpers/fake-prisma";

const STREET = "412 Harvest Lane";
const REQUESTER = "Ruth Boaz";
const REQUESTER_EMAIL = "ruth@example.com";
const PRAYER = "Please pray for my mother.";
const BIO = "Retired landscaper, twenty years in the neighbourhood.";

const volunteer: FakeMemberRow = {
  id: "vol-1",
  name: "Boaz Elimelech",
  email: "boaz@ascend.test",
  role: "SERVER",
  services_provided: ["Yard work"],
  bio: BIO,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

const otherVolunteer: FakeMemberRow = {
  ...volunteer,
  id: "vol-2",
  name: "Naomi Mahlon",
  email: "naomi@ascend.test",
  bio: null,
};

const admin: FakeMemberRow = {
  ...volunteer,
  id: "admin-1",
  name: "Root Admin",
  email: "admin@ascend.test",
  role: "ADMIN",
  bio: null,
};

let db: FakePrisma;
let logLines: string[];

function captureLogs() {
  logLines = [];
  const capture = (...args: unknown[]) => {
    logLines.push(args.map(String).join(" "));
  };
  vi.spyOn(console, "log").mockImplementation(capture);
  vi.spyOn(console, "warn").mockImplementation(capture);
  vi.spyOn(console, "error").mockImplementation(capture);
}

function seedRequest(overrides: Partial<FakeRequestRow> = {}): FakeRequestRow {
  const now = new Date("2026-03-01T10:00:00.000Z");
  const row: FakeRequestRow = {
    id: `req-${db.requests.length + 1}`,
    requester_name: REQUESTER,
    requester_email: REQUESTER_EMAIL,
    service_type: "Yard work",
    neighborhood: "Eastside",
    street_address: STREET,
    prayer_request: PRAYER,
    prayer_private: true,
    status: "NEW",
    assignedToId: null,
    assignedAt: null,
    tracking_token: `token-${db.requests.length + 1}`,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  db.requests.push(row);
  return row;
}

function assign(requestId: string, member: FakeMemberRow = volunteer) {
  return assignRequestToVolunteer({
    requestId,
    volunteer: { id: member.id, name: member.name, bio: member.bio },
  });
}

beforeEach(() => {
  db = createFakePrisma([volunteer, otherVolunteer, admin]);
  prismaProxy.holder.current = db.client as Record<string, unknown>;
  captureLogs();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("assignRequestToVolunteer", () => {
  it("moves a NEW request to ASSIGNED and records the volunteer", async () => {
    const request = seedRequest();

    const result = await assign(request.id);

    expect(result).toMatchObject({ ok: true, connectionEmail: "sent" });
    expect(db.requests[0]).toMatchObject({
      status: "ASSIGNED",
      assignedToId: volunteer.id,
    });
    expect(db.requests[0].assignedAt).toBeInstanceOf(Date);
  });

  it("writes the transition to the audit log with the actor and both statuses", async () => {
    const request = seedRequest();

    await assign(request.id);

    expect(db.auditLogs).toContainEqual(
      expect.objectContaining({
        actorId: volunteer.id,
        requestId: request.id,
        action: REQUEST_ASSIGNED_ACTION,
        fromStatus: "NEW",
        toStatus: "ASSIGNED",
        metadata: {
          source: "help_wanted_board",
          assigneeId: volunteer.id,
          service_type: "Yard work",
          neighborhood: "Eastside",
        },
      }),
    );
  });

  it("hands the assignee the street address they need to show up", async () => {
    const request = seedRequest();

    const result = await assign(request.id);

    expect(result).toMatchObject({
      ok: true,
      request: {
        id: request.id,
        requester_name: REQUESTER,
        requester_email: REQUESTER_EMAIL,
        street_address: STREET,
        status: "ASSIGNED",
      },
    });
    // Prayer text stays with staff until the requester opts in to sharing it.
    expect(result).not.toMatchObject({ request: { prayer_request: PRAYER } });
  });

  it("logs the connection email stub introducing the volunteer, BCC'ing admins", async () => {
    const request = seedRequest();

    await assign(request.id);

    const emailLine = logLines.find((line) => line.includes("email_sent"));
    expect(emailLine).toBeDefined();

    const payload = JSON.parse(emailLine as string);
    expect(payload).toMatchObject({
      transport: "log",
      template: "volunteer_connection",
      to: REQUESTER_EMAIL,
      bcc: [admin.email],
    });
    expect(payload.subject).toContain(volunteer.name);
    expect(payload.body).toContain(REQUESTER);
    expect(payload.body).toContain(volunteer.name);
    expect(payload.body).toContain(BIO);

    expect(db.auditLogs).toContainEqual(
      expect.objectContaining({
        requestId: request.id,
        action: CONNECTION_EMAIL_ACTION,
        metadata: expect.objectContaining({ template: "volunteer_connection" }),
      }),
    );
  });

  it("keeps the street address, prayer text and tracking token out of the email and logs", async () => {
    const request = seedRequest();

    await assign(request.id);

    const logged = logLines.join("\n");
    expect(logged).toContain("request_assigned");
    expect(logged).not.toContain(STREET);
    expect(logged).not.toContain(PRAYER);
    expect(logged).not.toContain(request.tracking_token);
    expect(JSON.stringify(db.auditLogs)).not.toContain(STREET);
  });

  it("still assigns, and says so, when the requester left no email address", async () => {
    const request = seedRequest({ requester_email: null });

    const result = await assign(request.id);

    expect(result).toMatchObject({
      ok: true,
      connectionEmail: "skipped_no_requester_email",
    });
    expect(db.requests[0].status).toBe("ASSIGNED");
    expect(logLines.join("\n")).toContain("connection_email_skipped");
    expect(logLines.join("\n")).not.toContain("email_sent");
  });

  it("lets only the first of two volunteers claim the same sticky note", async () => {
    const request = seedRequest();

    const [first, second] = [
      await assign(request.id, volunteer),
      await assign(request.id, otherVolunteer),
    ];

    expect(first).toMatchObject({ ok: true });
    expect(second).toEqual({ ok: false, reason: "already_claimed" });
    expect(db.requests[0].assignedToId).toBe(volunteer.id);
    expect(
      db.auditLogs.filter((row) => row.action === REQUEST_ASSIGNED_ACTION),
    ).toHaveLength(1);
  });

  it("reports an unknown request without touching the audit log", async () => {
    seedRequest();

    const result = await assign("not-a-real-request");

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(db.auditLogs).toHaveLength(0);
  });
});
