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

import { listAssignmentsForVolunteer, loadHelpWantedBoard } from "@/lib/requests/board";
import { resolveBoardSkillFilter } from "@/lib/requests/skill-filter";

import { createFakePrisma, type FakePrisma, type FakeRequestRow } from "./helpers/fake-prisma";

const STREET = "412 Harvest Lane";
const VOLUNTEER_ID = "vol-1";

let db: FakePrisma;

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
    createdAt: new Date(`2026-03-0${index}T10:00:00.000Z`),
    updatedAt: new Date(`2026-03-0${index}T10:00:00.000Z`),
    ...overrides,
  };
  db.requests.push(row);
  return row;
}

beforeEach(() => {
  db = createFakePrisma();
  prismaProxy.holder.current = db.client as Record<string, unknown>;
});

describe("resolveBoardSkillFilter", () => {
  it("defaults to every skill on the volunteer's profile", () => {
    expect(
      resolveBoardSkillFilter({ providedSkills: ["Yard work", "Meals"] }),
    ).toEqual({
      serviceTypes: ["Yard work", "Meals"],
      applied: ["Yard work", "Meals"],
      available: ["Yard work", "Meals"],
      requested: [],
    });
  });

  it("narrows to the skills the volunteer ticked", () => {
    expect(
      resolveBoardSkillFilter({
        providedSkills: ["Yard work", "Meals", "Transportation"],
        requestedSkills: ["meals"],
      }),
    ).toMatchObject({ serviceTypes: ["Meals"], applied: ["Meals"], requested: ["Meals"] });
  });

  it("never widens the board past the skills on the profile", () => {
    expect(
      resolveBoardSkillFilter({
        providedSkills: ["Meals"],
        requestedSkills: ["Meals", "Home repair"],
      }),
    ).toMatchObject({ serviceTypes: ["Meals"] });
  });

  it("falls back to the full profile when the ticked skills match nothing", () => {
    expect(
      resolveBoardSkillFilter({
        providedSkills: ["Meals"],
        requestedSkills: ["Home repair"],
      }),
    ).toMatchObject({ serviceTypes: ["Meals"], applied: ["Meals"], requested: [] });
  });

  it("shows everything to a volunteer with no skills on file", () => {
    expect(resolveBoardSkillFilter({ providedSkills: [] })).toMatchObject({
      serviceTypes: null,
      available: [],
    });
  });

  it("ignores blank and duplicate skills", () => {
    expect(
      resolveBoardSkillFilter({ providedSkills: ["Meals", " meals ", "  "] }),
    ).toMatchObject({ available: ["Meals"] });
  });
});

describe("loadHelpWantedBoard", () => {
  it("lists only NEW requests matching the volunteer's skills, newest first", async () => {
    seedRequest({ id: "yard-old", service_type: "Yard work" });
    seedRequest({ id: "meals", service_type: "Meals" });
    seedRequest({ id: "yard-new", service_type: "Yard work" });
    seedRequest({ id: "yard-taken", service_type: "Yard work", status: "ASSIGNED" });

    const board = await loadHelpWantedBoard({
      volunteer: { services_provided: ["Yard work"] },
    });

    expect(board.open.map((request) => request.id)).toEqual(["yard-new", "yard-old"]);
  });

  it("honours a narrower selection from the board's skill chips", async () => {
    seedRequest({ id: "yard", service_type: "Yard work" });
    seedRequest({ id: "meals", service_type: "Meals" });

    const board = await loadHelpWantedBoard({
      volunteer: { services_provided: ["Yard work", "Meals"] },
      requestedSkills: ["Meals"],
    });

    expect(board.open.map((request) => request.id)).toEqual(["meals"]);
    expect(board.filter.applied).toEqual(["Meals"]);
  });

  it("shows every open request to a volunteer with no skills recorded", async () => {
    seedRequest({ id: "yard", service_type: "Yard work" });
    seedRequest({ id: "meals", service_type: "Meals" });

    const board = await loadHelpWantedBoard({ volunteer: { services_provided: [] } });

    expect(board.open).toHaveLength(2);
  });

  it("never puts the street address or requester name on an open card", async () => {
    seedRequest();

    const board = await loadHelpWantedBoard({
      volunteer: { services_provided: ["Yard work"] },
    });

    expect(board.open[0]).not.toHaveProperty("street_address");
    expect(JSON.stringify(board.open)).not.toContain(STREET);
    expect(JSON.stringify(board.open)).not.toContain("Ruth Boaz");
  });
});

describe("listAssignmentsForVolunteer", () => {
  it("returns the volunteer's own active assignments with the address", async () => {
    seedRequest({
      id: "mine",
      status: "ASSIGNED",
      assignedToId: VOLUNTEER_ID,
      assignedAt: new Date("2026-03-04T10:00:00.000Z"),
    });
    seedRequest({
      id: "someone-elses",
      status: "ASSIGNED",
      assignedToId: "vol-2",
      assignedAt: new Date("2026-03-05T10:00:00.000Z"),
    });
    seedRequest({
      id: "mine-finished",
      status: "COMPLETE",
      assignedToId: VOLUNTEER_ID,
      assignedAt: new Date("2026-03-02T10:00:00.000Z"),
    });

    const assignments = await listAssignmentsForVolunteer(VOLUNTEER_ID);

    expect(assignments.map((assignment) => assignment.id)).toEqual(["mine"]);
    expect(assignments[0].street_address).toBe(STREET);
  });

  it("is empty for a volunteer who has claimed nothing", async () => {
    seedRequest();

    await expect(listAssignmentsForVolunteer(VOLUNTEER_ID)).resolves.toEqual([]);
  });
});
