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
vi.mock("@/lib/logger", () => ({ log: vi.fn() }));

import { GET as getPublicRequests, POST as postRequest } from "@/app/api/requests/route";
import { GET as getTrackedRequest } from "@/app/api/requests/track/[token]/route";

import { createFakePrisma, type FakePrisma } from "./helpers/fake-prisma";

const STREET = "412 Harvest Lane";
const NAME = "Ruth Boaz";

const submission = {
  requester_name: NAME,
  service_type: "Yard work",
  neighborhood: "Eastside",
  street_address: STREET,
  prayer_request: "Please pray for my mother.",
  prayer_private: true,
};

let db: FakePrisma;

function postJson(body: unknown) {
  return postRequest(
    new Request("http://localhost:3000/api/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function trackingRequest(token: string) {
  return getTrackedRequest(
    new Request(`http://localhost:3000/api/requests/track/${token}`),
    { params: Promise.resolve({ token }) },
  );
}

async function createViaApi(body: unknown = submission) {
  const response = await postJson(body);
  expect(response.status).toBe(201);
  return response.json();
}

beforeEach(() => {
  db = createFakePrisma();
  prismaProxy.holder.current = db.client as Record<string, unknown>;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/requests", () => {
  it("creates a NEW request and hands back a tracking token and portal link", async () => {
    const body = await createViaApi();

    expect(body.status).toBe("NEW");
    expect(body.tracking_token).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(body.tracking_path).toBe(`/track/${body.tracking_token}`);
    expect(body.tracking_url).toBe(
      `http://localhost:3000/track/${body.tracking_token}`,
    );
    expect(db.requests).toHaveLength(1);
  });

  it("records an AuditLog row for the anonymous submission", async () => {
    const body = await createViaApi();

    expect(db.auditLogs).toHaveLength(1);
    expect(db.auditLogs[0]).toMatchObject({
      actorId: null,
      requestId: body.id,
      action: "REQUEST_CREATED",
      toStatus: "NEW",
    });
  });

  it("rejects an incomplete submission with per-field codes", async () => {
    const response = await postJson({ requester_name: "Ruth Boaz" });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_input",
      fields: {
        service_type: "required",
        neighborhood: "required",
        street_address: "required",
      },
    });
    expect(db.requests).toHaveLength(0);
    expect(db.auditLogs).toHaveLength(0);
  });

  it("rejects a body that is not JSON", async () => {
    const response = await postRequest(
      new Request("http://localhost:3000/api/requests", {
        method: "POST",
        body: "not json",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_body" });
  });
});

describe("GET /api/requests/track/[token]", () => {
  it("returns the request for the token holder without a session", async () => {
    const created = await createViaApi();

    const response = await trackingRequest(created.tracking_token);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      request: {
        id: created.id,
        requester_name: NAME,
        service_type: "Yard work",
        neighborhood: "Eastside",
        street_address: STREET,
        prayer_request: "Please pray for my mother.",
        prayer_private: true,
        status: "NEW",
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    });
  });

  it("answers 404 for an unknown token", async () => {
    await createViaApi();

    const response = await trackingRequest("Zm9yZ2VkLXRva2VuLXZhbHVl");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
  });

  it("answers 404 for a malformed token without touching the database", async () => {
    const response = await trackingRequest("../../etc/passwd");

    expect(response.status).toBe(404);
  });
});

describe("GET /api/requests (public board feed)", () => {
  it("never exposes the street address or requester name", async () => {
    await createViaApi();

    const response = await getPublicRequests();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.requests).toHaveLength(1);
    expect(payload.requests[0]).toEqual({
      id: expect.any(String),
      service_type: "Yard work",
      neighborhood: "Eastside",
      status: "NEW",
      createdAt: expect.any(String),
    });

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain(STREET);
    expect(serialized).not.toContain(NAME);
    expect(serialized).not.toContain("pray");
  });

  it("is empty until a request exists", async () => {
    const response = await getPublicRequests();

    await expect(response.json()).resolves.toEqual({ requests: [] });
  });
});
