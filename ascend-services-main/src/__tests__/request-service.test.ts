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

import type { HelpRequestInput } from "@/lib/requests/input";
import {
  REQUEST_CREATED_ACTION,
  createHelpRequest,
  findRequestByTrackingToken,
  listPublicRequests,
} from "@/lib/requests/service";

import { createFakePrisma, type FakePrisma, type FakeRequestRow } from "./helpers/fake-prisma";

const STREET = "412 Harvest Lane";
const NAME = "Ruth Boaz";
const PRAYER = "Please pray for my mother.";

const input: HelpRequestInput = {
  requester_name: NAME,
  requester_email: null,
  service_type: "Yard work",
  neighborhood: "Eastside",
  street_address: STREET,
  prayer_request: PRAYER,
  prayer_private: true,
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

function seedRequest(overrides: Partial<FakeRequestRow>): FakeRequestRow {
  const now = new Date();
  const row: FakeRequestRow = {
    id: `seed-${db.requests.length + 1}`,
    requester_name: NAME,
    requester_email: null,
    service_type: "Yard work",
    neighborhood: "Eastside",
    street_address: STREET,
    prayer_request: null,
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

beforeEach(() => {
  db = createFakePrisma();
  prismaProxy.holder.current = db.client as Record<string, unknown>;
  captureLogs();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createHelpRequest", () => {
  it("stores the submission as a NEW request with a unique tracking token", async () => {
    const created = await createHelpRequest(input);

    expect(created.status).toBe("NEW");
    expect(created.tracking_token).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(created.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    expect(db.requests).toHaveLength(1);
    expect(db.requests[0]).toMatchObject({
      ...input,
      status: "NEW",
      tracking_token: created.tracking_token,
    });
  });

  it("writes an AuditLog row for the unauthenticated creation", async () => {
    const created = await createHelpRequest(input);

    expect(db.auditLogs).toHaveLength(1);
    expect(db.auditLogs[0]).toMatchObject({
      actorId: null,
      requestId: created.id,
      action: REQUEST_CREATED_ACTION,
      fromStatus: null,
      toStatus: "NEW",
      metadata: {
        source: "public_request_form",
        service_type: "Yard work",
        neighborhood: "Eastside",
        has_prayer_request: true,
        prayer_private: true,
      },
    });
  });

  it("keeps PII out of the audit metadata", async () => {
    await createHelpRequest(input);

    const metadata = JSON.stringify(db.auditLogs[0].metadata);
    expect(metadata).not.toContain(STREET);
    expect(metadata).not.toContain(NAME);
    expect(metadata).not.toContain(PRAYER);
    expect(metadata).not.toContain(db.requests[0].tracking_token);
  });

  it("keeps PII and the tracking token out of the structured logs", async () => {
    const created = await createHelpRequest(input);

    const logged = logLines.join("\n");
    expect(logged).toContain("help_request_created");
    expect(logged).toContain(created.id);
    expect(logged).not.toContain(STREET);
    expect(logged).not.toContain(NAME);
    expect(logged).not.toContain(PRAYER);
    expect(logged).not.toContain(created.tracking_token);
  });

  it("leaves no orphan request when the audit write fails", async () => {
    db.failNextAuditCreate(new Error("audit unavailable"));

    await expect(createHelpRequest(input)).rejects.toThrow("audit unavailable");
    expect(db.requests).toHaveLength(0);
    expect(db.auditLogs).toHaveLength(0);
  });

  it("retries with a fresh token if one ever collides", async () => {
    db.failNextCreatesWithTokenCollision(1);

    const created = await createHelpRequest(input);

    expect(db.requests).toHaveLength(1);
    expect(db.requests[0].tracking_token).toBe(created.tracking_token);
    expect(logLines.join("\n")).toContain("tracking_token_collision_retry");
  });

  it("gives up rather than looping forever on a persistent collision", async () => {
    db.failNextCreatesWithTokenCollision(10);

    await expect(createHelpRequest(input)).rejects.toMatchObject({ code: "P2002" });
    expect(db.requests).toHaveLength(0);
  });
});

describe("findRequestByTrackingToken", () => {
  it("returns the requester's own submission, address included", async () => {
    const created = await createHelpRequest(input);

    const view = await findRequestByTrackingToken(created.tracking_token);

    expect(view).toMatchObject({
      id: created.id,
      requester_name: NAME,
      street_address: STREET,
      prayer_request: PRAYER,
      status: "NEW",
    });
  });

  it("returns null for an unknown token", async () => {
    await createHelpRequest(input);

    await expect(findRequestByTrackingToken("not-a-real-token")).resolves.toBeNull();
  });
});

describe("listPublicRequests", () => {
  it("lists only NEW requests, newest first", async () => {
    seedRequest({
      id: "older",
      status: "NEW",
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
    });
    seedRequest({
      id: "newer",
      status: "NEW",
      createdAt: new Date("2026-03-05T00:00:00.000Z"),
    });
    seedRequest({ id: "assigned", status: "ASSIGNED" });

    const listed = await listPublicRequests();

    expect(listed.map((request) => request.id)).toEqual(["newer", "older"]);
  });

  it("never returns the street address", async () => {
    await createHelpRequest(input);

    const listed = await listPublicRequests();

    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(STREET);
    expect(listed[0]).not.toHaveProperty("street_address");
  });

  it("caps the number of rows it asks the database for", async () => {
    for (let index = 0; index < 5; index += 1) {
      seedRequest({ id: `bulk-${index}` });
    }

    await expect(listPublicRequests(2)).resolves.toHaveLength(2);
  });
});
