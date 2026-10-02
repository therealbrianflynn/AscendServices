import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  log: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and db ok when Postgres is reachable", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ "?column?": 1 }]);
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "ok", db: "ok" });
  });

  it("returns non-200 when Postgres is unreachable", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const res = await GET();
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).not.toBe(200);
    const body = await res.json();
    expect(body.db).toBe("unreachable");
    expect(body.status).toBe("degraded");
  });
});
