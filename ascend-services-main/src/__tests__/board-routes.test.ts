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

import { POST as postAssign } from "@/app/api/board/requests/[id]/assign/route";
import { SESSION_COOKIE_NAME, signSession } from "@/lib/auth/session";

import {
  createFakePrisma,
  type FakeMemberRow,
  type FakePrisma,
  type FakeRequestRow,
} from "./helpers/fake-prisma";

const SECRET = process.env.AUTH_SESSION_SECRET as string;
const STREET = "412 Harvest Lane";

const volunteer: FakeMemberRow = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Boaz Elimelech",
  email: "boaz@ascend.test",
  role: "SERVER",
  services_provided: ["Yard work"],
  bio: "Retired landscaper.",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

let db: FakePrisma;

function signIn(member: FakeMemberRow = volunteer) {
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

function seedRequest(overrides: Partial<FakeRequestRow> = {}): FakeRequestRow {
  const index = db.requests.length + 1;
  const row: FakeRequestRow = {
    id: `req-${index}`,
    requester_name: "Ruth Boaz",
    requester_email: "ruth@example.com",
    service_type: "Yard work",
    neighborhood: "Eastside",
    street_address: STREET,
    prayer_request: null,
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

function assign(id: string) {
  return postAssign(
    new Request(`http://localhost:3000/api/board/requests/${id}/assign`, {
      method: "POST",
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  db = createFakePrisma([volunteer]);
  prismaProxy.holder.current = db.client as Record<string, unknown>;
  signIn();
});

describe("POST /api/board/requests/[id]/assign", () => {
  it("assigns the request to the signed-in volunteer", async () => {
    const request = seedRequest();

    const response = await assign(request.id);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      request: {
        id: request.id,
        requester_name: "Ruth Boaz",
        requester_email: "ruth@example.com",
        service_type: "Yard work",
        neighborhood: "Eastside",
        street_address: STREET,
        status: "ASSIGNED",
        createdAt: expect.any(String),
        assignedAt: expect.any(String),
      },
      connection_email: "sent",
    });
    expect(db.requests[0].assignedToId).toBe(volunteer.id);
  });

  it("refuses a request that another volunteer already claimed", async () => {
    const request = seedRequest({ status: "ASSIGNED", assignedToId: "vol-2" });

    const response = await assign(request.id);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "already_claimed" });
    expect(db.requests[0].assignedToId).toBe("vol-2");
  });

  it("answers 404 for a request that does not exist", async () => {
    const response = await assign("no-such-request");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
  });

  it("requires a session before it touches a request", async () => {
    signOut();
    const request = seedRequest();

    const response = await assign(request.id);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthenticated" });
    expect(db.requests[0].status).toBe("NEW");
  });

  it("rejects a signed cookie whose account no longer exists", async () => {
    const request = seedRequest();
    db.users.splice(0, db.users.length);

    const response = await assign(request.id);

    expect(response.status).toBe(401);
    expect(db.requests[0].status).toBe("NEW");
  });
});
