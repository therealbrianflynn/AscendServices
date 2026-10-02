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

import { listAdminRequests } from "@/lib/admin/requests";
import { ADMIN_USER_SELECT, listAdminUsers } from "@/lib/admin/users";
import { ADMIN_REQUEST_SELECT } from "@/lib/requests/views";

import {
  createFakePrisma,
  type FakeMemberRow,
  type FakePrisma,
  type FakeRequestRow,
} from "./helpers/fake-prisma";

const PRAYER = "Please pray for my knee.";
const TRACKING_TOKEN = "tracking-token-do-not-leak";

const admin: FakeMemberRow = {
  id: "admin-1",
  name: "Root Admin",
  email: "admin@ascend.test",
  role: "ADMIN",
  services_provided: [],
  bio: null,
  onboarding_token: "onboarding-secret",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

const volunteer: FakeMemberRow = {
  id: "vol-1",
  name: "Boaz Elimelech",
  email: "boaz@ascend.test",
  role: "SERVER",
  services_provided: ["Yard work", "Meals"],
  bio: "Retired landscaper.",
  createdAt: new Date("2026-02-01T00:00:00.000Z"),
};

let db: FakePrisma;

function seedRequest(overrides: Partial<FakeRequestRow> = {}): FakeRequestRow {
  const index = db.requests.length + 1;
  const row: FakeRequestRow = {
    id: `req-${index}`,
    requester_name: "Ruth Boaz",
    requester_email: "ruth@example.com",
    service_type: "Yard work",
    neighborhood: "Eastside",
    street_address: "412 Harvest Lane",
    prayer_request: PRAYER,
    prayer_private: true,
    status: "NEW",
    assignedToId: null,
    assignedAt: null,
    tracking_token: TRACKING_TOKEN,
    createdAt: new Date("2026-03-01T10:00:00.000Z"),
    updatedAt: new Date("2026-03-01T10:00:00.000Z"),
    ...overrides,
  };
  db.requests.push(row);
  return row;
}

beforeEach(() => {
  db = createFakePrisma([admin, volunteer]);
  prismaProxy.holder.current = db.client as Record<string, unknown>;
});

describe("listAdminRequests", () => {
  it("lists every status, newest first", async () => {
    seedRequest({ createdAt: new Date("2026-03-01T10:00:00.000Z") });
    seedRequest({
      status: "COMPLETE",
      createdAt: new Date("2026-03-05T10:00:00.000Z"),
    });

    const requests = await listAdminRequests();

    expect(requests.map((request) => request.status)).toEqual(["COMPLETE", "NEW"]);
  });

  it("resolves the assigned volunteer, and reports an unclaimed request as null", async () => {
    seedRequest({
      status: "ASSIGNED",
      assignedToId: volunteer.id,
      assignedAt: new Date("2026-03-02T09:00:00.000Z"),
      createdAt: new Date("2026-03-02T08:00:00.000Z"),
    });
    seedRequest({ createdAt: new Date("2026-03-01T08:00:00.000Z") });

    const [claimed, open] = await listAdminRequests();

    expect(claimed.assignee).toEqual({
      id: volunteer.id,
      name: volunteer.name,
      email: volunteer.email,
    });
    expect(claimed.assignedAt).toBe("2026-03-02T09:00:00.000Z");
    expect(open.assignee).toBeNull();
    expect(open.assignedAt).toBeNull();
  });

  it("never selects the prayer text or the tracking token", async () => {
    seedRequest();

    const [request] = await listAdminRequests();

    expect(request).not.toHaveProperty("prayer_request");
    expect(request).not.toHaveProperty("tracking_token");
    expect(JSON.stringify(request)).not.toContain(PRAYER);
    expect(JSON.stringify(request)).not.toContain(TRACKING_TOKEN);
    expect(ADMIN_REQUEST_SELECT).not.toHaveProperty("prayer_request");
    expect(ADMIN_REQUEST_SELECT).not.toHaveProperty("tracking_token");
  });

  it("bounds the page size", async () => {
    seedRequest();
    seedRequest();
    seedRequest();

    expect(await listAdminRequests(2)).toHaveLength(2);
  });
});

describe("listAdminUsers", () => {
  it("lists members newest first with their roles parsed", async () => {
    const users = await listAdminUsers();

    expect(users).toEqual([
      {
        id: volunteer.id,
        name: volunteer.name,
        email: volunteer.email,
        role: "SERVER",
        services_provided: ["Yard work", "Meals"],
        createdAt: "2026-02-01T00:00:00.000Z",
      },
      {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: "ADMIN",
        services_provided: [],
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("never selects the onboarding token", async () => {
    const users = await listAdminUsers();

    for (const user of users) {
      expect(user).not.toHaveProperty("onboarding_token");
    }
    expect(JSON.stringify(users)).not.toContain("onboarding-secret");
    expect(ADMIN_USER_SELECT).not.toHaveProperty("onboarding_token");
  });

  it("bounds the page size", async () => {
    expect(await listAdminUsers(1)).toHaveLength(1);
  });
});
