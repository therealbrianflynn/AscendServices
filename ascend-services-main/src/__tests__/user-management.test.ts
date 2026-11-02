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

import { POST as createUser } from "@/app/api/admin/users/route";
import { PATCH as updateUser } from "@/app/api/admin/users/[id]/route";
import {
  assertAdminChangeIsSafe,
  ManagedUserError,
  nextDeactivatedAt,
  nextValidatedAt,
  parseManagedUser,
} from "@/lib/admin/managed-user";
import { createManagedUser, updateManagedUser } from "@/lib/admin/user-directory";
import { requireSession } from "@/lib/auth/guard";
import { SESSION_COOKIE_NAME, signSession } from "@/lib/auth/session";

import {
  createFakePrisma,
  type FakeMemberRow,
  type FakePrisma,
} from "./helpers/fake-prisma";

const SECRET = process.env.AUTH_SESSION_SECRET as string;
const SERVICES = ["Counseling", "Auto Mechanic", "Meals"];

const admin: FakeMemberRow = {
  id: "55555555-5555-4555-8555-555555555555",
  name: "Root Admin",
  email: "admin@ascend.test",
  role: "ADMIN",
  services_provided: [],
  bio: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

const server: FakeMemberRow = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Boaz Elimelech",
  email: "boaz@ascend.test",
  role: "SERVER",
  services_provided: ["Meals"],
  bio: "Brings meals.",
  createdAt: new Date("2026-02-01T00:00:00.000Z"),
};

let db: FakePrisma;

function signIn(member: FakeMemberRow) {
  const cookie = signSession(
    { sub: member.id, email: member.email, role: member.role as "SERVER" | "ADMIN" | "REQUESTER" },
    SECRET,
    24,
  );
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      name === SESSION_COOKIE_NAME ? { name, value: cookie } : undefined,
  } as never);
}

beforeEach(() => {
  db = createFakePrisma([admin, server]);
  prismaProxy.holder.current = db.client as Record<string | symbol, unknown>;
});

describe("parseManagedUser", () => {
  it("accepts a requester and the new service types", () => {
    expect(
      parseManagedUser(
        {
          name: "Ruth",
          email: " Ruth@Example.com ",
          role: "REQUESTER",
          bio: "Needs a ride.",
          services: ["Counseling", "Counseling"],
          validated: true,
          active: true,
        },
        SERVICES,
      ),
    ).toEqual({
      name: "Ruth",
      email: "ruth@example.com",
      role: "REQUESTER",
      bio: "Needs a ride.",
      phone: null,
      services: ["Counseling"],
      validated: true,
      active: true,
    });
  });

  it("rejects an unknown role, a bad email, and a service we do not offer", () => {
    expect(() =>
      parseManagedUser(
        {
          name: "Ruth",
          email: "ruth@example.com",
          role: "OWNER",
          bio: "",
          services: [],
          validated: false,
          active: true,
        },
        SERVICES,
      ),
    ).toThrow(ManagedUserError);

    expect(() =>
      parseManagedUser(
        {
          name: "Ruth",
          email: "not-an-email",
          role: "REQUESTER",
          bio: "",
          services: ["Plumbing"],
          validated: false,
          active: true,
        },
        SERVICES,
      ),
    ).toThrow(ManagedUserError);
  });
});

describe("admin safety rules", () => {
  it("refuses to remove the last active admin", () => {
    expect(() =>
      assertAdminChangeIsSafe({
        actorId: "other",
        targetId: admin.id,
        targetRole: "ADMIN",
        targetActive: true,
        nextRole: "REQUESTER",
        nextActive: true,
        activeAdminCount: 1,
      }),
    ).toThrow(/last_admin/);
  });

  it("refuses to let an admin deactivate themselves", () => {
    expect(() =>
      assertAdminChangeIsSafe({
        actorId: admin.id,
        targetId: admin.id,
        targetRole: "ADMIN",
        targetActive: true,
        nextRole: "ADMIN",
        nextActive: false,
        activeAdminCount: 2,
      }),
    ).toThrow(/self_deactivate/);
  });

  it("keeps validation only for an active server choice", () => {
    const stamped = new Date("2026-04-01T00:00:00.000Z");
    expect(nextValidatedAt("SERVER", true, stamped)).toBe(stamped);
    expect(nextValidatedAt("REQUESTER", true, stamped)).toBeNull();
    expect(nextValidatedAt("ADMIN", true, stamped)).toBeNull();
    expect(nextDeactivatedAt(false, stamped)).toBe(stamped);
    expect(nextDeactivatedAt(true, stamped)).toBeNull();
  });
});

describe("user directory", () => {
  it("adds a requester and still saves the account when email fails", async () => {
    const created = await createManagedUser(
      {
        name: "Naomi",
        email: "naomi@example.com",
        role: "REQUESTER",
        bio: "",
        phone: "3175550100",
        services: ["Auto Mechanic"],
        validated: false,
        active: false,
      },
      admin.id,
      async () => false,
    );

    const saved = db.users.find((user) => user.id === created.id);
    expect(created.emailSent).toBe(false);
    expect(saved?.role).toBe("REQUESTER");
    expect(saved?.services_provided).toEqual(["Auto Mechanic"]);
    expect(saved?.phone).toBe("3175550100");
    expect(saved?.deactivatedAt ?? null).toBeNull();
  });

  it("deactivates a server and blocks that session", async () => {
    await updateManagedUser(
      server.id,
      {
        name: server.name,
        email: server.email,
        role: "SERVER",
        bio: "Brings meals.",
        phone: null,
        services: ["Meals"],
        validated: false,
        active: false,
      },
      admin.id,
    );

    expect(db.users.find((user) => user.id === server.id)?.deactivatedAt).toBeInstanceOf(Date);
    signIn(server);
    const guarded = await requireSession();
    expect(guarded.ok).toBe(false);
  });

  it("does not demote the only admin", async () => {
    await expect(
      updateManagedUser(
        admin.id,
        {
          name: admin.name,
          email: admin.email,
          role: "REQUESTER",
          bio: "",
          phone: null,
          services: [],
          validated: false,
          active: true,
        },
        admin.id,
      ),
    ).rejects.toMatchObject({ code: "last_admin" });
  });
});

describe("user management routes", () => {
  it("lets an admin add a person", async () => {
    signIn(admin);
    const response = await createUser(
      new Request("http://localhost/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Naomi",
          email: "naomi@example.com",
          role: "REQUESTER",
          bio: "Lives nearby.",
          services: ["Counseling"],
          validated: false,
          active: true,
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(db.users.some((user) => user.email === "naomi@example.com" && user.role === "REQUESTER")).toBe(
      true,
    );
  });

  it("hides the tool from a server", async () => {
    signIn(server);
    const response = await createUser(
      new Request("http://localhost/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ name: "Nope" }),
      }),
    );
    expect(response.status).toBe(403);
  });

  it("rejects deactivating the last admin", async () => {
    signIn(admin);
    const response = await updateUser(
      new Request("http://localhost/api/admin/users/admin", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: admin.name,
          email: admin.email,
          role: "ADMIN",
          bio: "",
          services: [],
          validated: false,
          active: false,
        }),
      }),
      { params: Promise.resolve({ id: admin.id }) },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "last_admin" });
  });
});
