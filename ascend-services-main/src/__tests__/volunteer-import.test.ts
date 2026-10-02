import { readFileSync } from "node:fs";
import path from "node:path";

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

import { POST as importVolunteersRoute } from "@/app/api/admin/users/import/route";
import { SESSION_COOKIE_NAME, signSession } from "@/lib/auth/session";
import { log } from "@/lib/logger";
import {
  VOLUNTEER_IMPORT_COLUMNS,
  VOLUNTEER_IMPORT_FILE_FIELD,
  VOLUNTEER_IMPORT_MAX_BYTES,
  VOLUNTEER_IMPORT_MAX_ROWS,
  fieldForHeader,
  normalizeHeader,
} from "@/lib/volunteers/import/contract";
import { readVolunteerImportTable } from "@/lib/volunteers/import/parse";
import {
  VOLUNTEER_IMPORTED_ACTION,
  VOLUNTEER_IMPORT_ACTION,
  importVolunteers,
} from "@/lib/volunteers/import/service";
import { mergeSkills, splitSkills } from "@/lib/volunteers/import/skills";
import {
  VOLUNTEER_WELCOME_TEMPLATE,
  volunteerWelcomeSubject,
} from "@/lib/volunteers/import/welcome";

import {
  createFakePrisma,
  type FakeMemberRow,
  type FakePrisma,
} from "./helpers/fake-prisma";

const SECRET = process.env.AUTH_SESSION_SECRET as string;

const FIXTURE_DIR = path.join(process.cwd(), "src/__fixtures__/volunteer-import");
const CSV_FIXTURE = readFileSync(path.join(FIXTURE_DIR, "volunteers.csv"));
const XLSX_FIXTURE = readFileSync(path.join(FIXTURE_DIR, "volunteers.xlsx"));

const admin: FakeMemberRow = {
  id: "55555555-5555-4555-8555-555555555555",
  name: "Root Admin",
  email: "admin@ascend.test",
  role: "ADMIN",
  services_provided: [],
  bio: null,
  onboarding_token: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

/** The member the fixture's first data row merges into. */
const volunteer: FakeMemberRow = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Boaz Elimelech",
  email: "boaz@ascend.test",
  role: "SERVER",
  services_provided: ["Yard work"],
  bio: "Retired landscaper.",
  onboarding_token: null,
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

/** Everything the structured logger was handed during this test. */
function loggedText(): string {
  return JSON.stringify(vi.mocked(log).mock.calls);
}

function csv(body: string): Buffer {
  return Buffer.from(body, "utf8");
}

function importCsv(body: string, filename = "volunteers.csv") {
  return importVolunteers({ filename, bytes: csv(body), actorId: admin.id });
}

function member(email: string): FakeMemberRow | undefined {
  return db.users.find((row) => row.email === email);
}

function upload(bytes: Buffer, filename: string, field = VOLUNTEER_IMPORT_FILE_FIELD) {
  const form = new FormData();
  form.set(field, new File([new Uint8Array(bytes)], filename));
  return importVolunteersRoute(
    new Request("http://localhost:3000/api/admin/users/import", {
      method: "POST",
      body: form,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  db = createFakePrisma([
    { ...admin, services_provided: [] },
    { ...volunteer, services_provided: ["Yard work"] },
  ]);
  prismaProxy.holder.current = db.client as Record<string, unknown>;
  signIn(admin);
});

describe("volunteer import column contract", () => {
  it("requires exactly one column — the email the upsert matches on", () => {
    const required = VOLUNTEER_IMPORT_COLUMNS.filter((column) => column.required);

    expect(required.map((column) => column.field)).toEqual(["email"]);
  });

  it("matches headers regardless of case, spacing or punctuation", () => {
    expect(normalizeHeader(" E-Mail Address ")).toBe("e mail address");
    expect(fieldForHeader("E-Mail")).toBe("email");
    expect(fieldForHeader("Full Name")).toBe("name");
    expect(fieldForHeader("services_provided")).toBe("services_provided");
    expect(fieldForHeader("Skills")).toBe("services_provided");
    expect(fieldForHeader("Favourite colour")).toBeNull();
  });

  it("splits a skills cell on commas or semicolons and drops repeats", () => {
    expect(splitSkills(" Meals; Yard work , meals ,, Errands ")).toEqual([
      "Meals",
      "Yard work",
      "Errands",
    ]);
    expect(splitSkills("   ")).toEqual([]);
  });

  it("merges skills as a union that keeps the profile's existing spelling", () => {
    expect(mergeSkills(["Yard work"], ["yard work", "Meals"])).toEqual([
      "Yard work",
      "Meals",
    ]);
  });
});

describe("readVolunteerImportTable", () => {
  it("reads the committed CSV sample", async () => {
    const result = await readVolunteerImportTable({
      filename: "volunteers.csv",
      bytes: CSV_FIXTURE,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.table.headers).toEqual(["Email", "Name", "Skills", "Bio"]);
    expect(result.table.rows).toHaveLength(5);
    expect(result.table.rows[0]).toEqual({
      row: 2,
      cells: ["boaz@ascend.test", "", "Meals; Errands or shopping", ""],
    });
  });

  it("reads the committed XLSX sample as the same table as the CSV", async () => {
    const [fromCsv, fromXlsx] = await Promise.all([
      readVolunteerImportTable({ filename: "volunteers.csv", bytes: CSV_FIXTURE }),
      readVolunteerImportTable({ filename: "volunteers.xlsx", bytes: XLSX_FIXTURE }),
    ]);

    expect(fromXlsx.ok && fromCsv.ok).toBe(true);
    if (!fromXlsx.ok || !fromCsv.ok) return;
    expect(fromXlsx.table.headers).toEqual(fromCsv.table.headers);
    expect(fromXlsx.table.rows).toEqual(fromCsv.table.rows);
    expect(fromXlsx.table.fileType).toBe("xlsx");
  });

  it("rejects a file type it cannot parse", async () => {
    await expect(
      readVolunteerImportTable({ filename: "volunteers.pdf", bytes: CSV_FIXTURE }),
    ).resolves.toEqual({ ok: false, error: "unsupported_file_type" });
  });

  it("rejects a sheet with no email column rather than importing nothing", async () => {
    await expect(
      readVolunteerImportTable({
        filename: "volunteers.csv",
        bytes: csv("Name,Skills\nRuth,Meals\n"),
      }),
    ).resolves.toEqual({ ok: false, error: "missing_email_column" });
  });

  it("rejects an empty file and a header with no data rows", async () => {
    await expect(
      readVolunteerImportTable({ filename: "volunteers.csv", bytes: csv("") }),
    ).resolves.toEqual({ ok: false, error: "empty_file" });
    await expect(
      readVolunteerImportTable({ filename: "volunteers.csv", bytes: csv("Email\n") }),
    ).resolves.toEqual({ ok: false, error: "no_data_rows" });
  });

  it("rejects a file past the size cap before it parses anything", async () => {
    const oversized = Buffer.alloc(VOLUNTEER_IMPORT_MAX_BYTES + 1, 0x61);

    await expect(
      readVolunteerImportTable({ filename: "volunteers.csv", bytes: oversized }),
    ).resolves.toEqual({ ok: false, error: "file_too_large" });
  });

  it("rejects a sheet with more rows than one import may carry", async () => {
    const rows = Array.from(
      { length: VOLUNTEER_IMPORT_MAX_ROWS + 1 },
      (_unused, index) => `member${index}@ascend.test`,
    );

    await expect(
      readVolunteerImportTable({
        filename: "volunteers.csv",
        bytes: csv(`Email\n${rows.join("\n")}\n`),
      }),
    ).resolves.toEqual({ ok: false, error: "too_many_rows" });
  });

  it("reports a malformed CSV instead of importing half of it", async () => {
    await expect(
      readVolunteerImportTable({
        filename: "volunteers.csv",
        bytes: csv('Email,Name\nruth@ascend.test,"unterminated\n'),
      }),
    ).resolves.toEqual({ ok: false, error: "unreadable_file" });
  });
});

describe("importVolunteers — existing member (merge)", () => {
  it("adds the sheet's skills to the ones already on the profile", async () => {
    const outcome = await importCsv(
      "Email,Skills\nboaz@ascend.test,Meals; Yard work\n",
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(member(volunteer.email)?.services_provided).toEqual(["Yard work", "Meals"]);
    expect(outcome.report.summary).toMatchObject({ merged: 1, created: 0, failed: 0 });
    expect(outcome.report.results).toEqual([
      expect.objectContaining({
        row: 2,
        email: volunteer.email,
        outcome: "merged",
        added_skills: ["Meals"],
      }),
    ]);
  });

  it("leaves the rest of the profile alone when the sheet leaves cells blank", async () => {
    await importCsv("Email,Name,Skills,Bio\nboaz@ascend.test,,Meals,\n");

    expect(member(volunteer.email)).toMatchObject({
      name: volunteer.name,
      bio: volunteer.bio,
      role: "SERVER",
    });
  });

  it("never re-mints the onboarding token of a member who already has one", async () => {
    const invited = member(volunteer.email)!;
    invited.onboarding_token = "already-invited";

    await importCsv("Email,Skills\nboaz@ascend.test,Meals\n");

    expect(member(volunteer.email)?.onboarding_token).toBe("already-invited");
  });

  it("never promotes a member to ADMIN from a spreadsheet", async () => {
    await importCsv("Email,Name,Skills\nadmin@ascend.test,Root Admin,Meals\n");
    await importCsv("Email,Skills\nboaz@ascend.test,Meals\n");

    expect(member(volunteer.email)?.role).toBe("SERVER");
    expect(db.users.filter((row) => row.role === "ADMIN")).toHaveLength(1);
  });

  it("updates the name and bio the sheet does supply", async () => {
    await importCsv(
      "Email,Name,Bio\nboaz@ascend.test,Boaz E. Elimelech,Retired landscaper and handyman.\n",
    );

    expect(member(volunteer.email)).toMatchObject({
      name: "Boaz E. Elimelech",
      bio: "Retired landscaper and handyman.",
    });
  });

  it("reports a row that changes nothing as unchanged and writes nothing", async () => {
    const outcome = await importCsv("Email,Skills\nboaz@ascend.test,Yard work\n");

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.report.summary).toMatchObject({ unchanged: 1, merged: 0 });
    expect(db.auditLogs.filter((row) => row.action === VOLUNTEER_IMPORTED_ACTION)).toEqual(
      [],
    );
  });

  it("does not send a welcome email to someone who already has an account", async () => {
    await importCsv("Email,Skills\nboaz@ascend.test,Meals\n");

    expect(loggedText()).not.toContain(VOLUNTEER_WELCOME_TEMPLATE);
  });

  it("audits the merge against the admin who uploaded the sheet", async () => {
    await importCsv("Email,Skills\nboaz@ascend.test,Meals\n");

    expect(
      db.auditLogs.filter((row) => row.action === VOLUNTEER_IMPORTED_ACTION),
    ).toEqual([
      expect.objectContaining({
        actorId: admin.id,
        action: VOLUNTEER_IMPORTED_ACTION,
        metadata: expect.objectContaining({
          outcome: "merged",
          userId: volunteer.id,
          added_skills: ["Meals"],
        }),
      }),
    ]);
  });
});

describe("importVolunteers — new member (welcome)", () => {
  const NEW_EMAIL = "ruth@ascend.test";

  it("creates a SERVER carrying the sheet's name, skills and bio", async () => {
    const outcome = await importCsv(
      `Email,Name,Skills,Bio\n${NEW_EMAIL},Ruth Naomi,"Meals, Transportation",Drives a twelve-seat van.\n`,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(member(NEW_EMAIL)).toMatchObject({
      name: "Ruth Naomi",
      email: NEW_EMAIL,
      role: "SERVER",
      services_provided: ["Meals", "Transportation"],
      bio: "Drives a twelve-seat van.",
    });
    expect(outcome.report.summary).toMatchObject({ created: 1, merged: 0, failed: 0 });
  });

  it("falls back to the address's local part when the sheet has no name", async () => {
    await importCsv(`Email,Skills\n${NEW_EMAIL},Meals\n`);

    expect(member(NEW_EMAIL)?.name).toBe("ruth");
  });

  it("normalises the address before it decides the account is new", async () => {
    await importCsv("Email,Skills\n  BOAZ@Ascend.TEST ,Meals\n");

    expect(db.users).toHaveLength(2);
    expect(member(volunteer.email)?.services_provided).toEqual(["Yard work", "Meals"]);
  });

  it("mints an onboarding token for the new account", async () => {
    await importCsv(`Email,Skills\n${NEW_EMAIL},Meals\n`);

    const token = member(NEW_EMAIL)?.onboarding_token;
    expect(typeof token).toBe("string");
    expect(token).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(member(volunteer.email)?.onboarding_token).toBeNull();
  });

  it("logs a welcome email telling them how to finish onboarding", async () => {
    await importCsv(`Email,Name,Skills\n${NEW_EMAIL},Ruth Naomi,Meals\n`);

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "email_sent",
        template: VOLUNTEER_WELCOME_TEMPLATE,
        to: NEW_EMAIL,
        subject: volunteerWelcomeSubject(),
      }),
    );
    expect(loggedText()).toContain("http://localhost:3000/signin");
  });

  it("never writes the onboarding token to a log line", async () => {
    await importCsv(`Email,Skills\n${NEW_EMAIL},Meals\n`);

    const token = member(NEW_EMAIL)?.onboarding_token as string;
    expect(token).toBeTruthy();
    expect(loggedText()).not.toContain(token);
  });

  it("keeps the onboarding token out of the report handed back to the admin", async () => {
    const outcome = await importCsv(`Email,Skills\n${NEW_EMAIL},Meals\n`);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const token = member(NEW_EMAIL)?.onboarding_token as string;
    expect(JSON.stringify(outcome.report)).not.toContain(token);
  });

  it("audits the new account without copying the token into the trail", async () => {
    await importCsv(`Email,Skills\n${NEW_EMAIL},Meals\n`);

    const token = member(NEW_EMAIL)?.onboarding_token as string;
    expect(
      db.auditLogs.filter((row) => row.action === VOLUNTEER_IMPORTED_ACTION),
    ).toEqual([
      expect.objectContaining({
        actorId: admin.id,
        metadata: expect.objectContaining({ outcome: "created" }),
      }),
    ]);
    expect(JSON.stringify(db.auditLogs)).not.toContain(token);
  });

  it("still creates the account when the welcome email cannot be sent", async () => {
    const outcome = await importVolunteers({
      filename: "volunteers.csv",
      bytes: csv(`Email,Skills\n${NEW_EMAIL},Meals\n`),
      actorId: admin.id,
      env: { ...process.env, EMAIL_TRANSPORT: "smtp" },
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(member(NEW_EMAIL)).toBeDefined();
    expect(outcome.report.results[0]).toMatchObject({
      outcome: "created",
      welcome: "failed",
    });
  });
});

describe("importVolunteers — row-level errors", () => {
  it("applies the good rows of the sample sheet and reports the bad ones", async () => {
    const outcome = await importVolunteers({
      filename: "volunteers.csv",
      bytes: CSV_FIXTURE,
      actorId: admin.id,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.report.summary).toEqual({
      created: 2,
      merged: 1,
      unchanged: 0,
      failed: 2,
    });
    expect(outcome.report.errors).toEqual([
      expect.objectContaining({ row: 4, code: "invalid_email" }),
      expect.objectContaining({ row: 5, code: "missing_email" }),
    ]);
    expect(member("ruth.naomi@ascend.test")).toBeDefined();
    expect(member("obed@ascend.test")).toBeDefined();
    expect(member(volunteer.email)?.services_provided).toEqual([
      "Yard work",
      "Meals",
      "Errands or shopping",
    ]);
  });

  it("reaches the same result from the XLSX sample", async () => {
    const outcome = await importVolunteers({
      filename: "volunteers.xlsx",
      bytes: XLSX_FIXTURE,
      actorId: admin.id,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.report.summary).toEqual({
      created: 2,
      merged: 1,
      unchanged: 0,
      failed: 2,
    });
  });

  it("rejects the second row that repeats an address inside one sheet", async () => {
    const outcome = await importCsv(
      "Email,Skills\nruth@ascend.test,Meals\nRUTH@ascend.test,Transportation\n",
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.report.summary).toMatchObject({ created: 1, failed: 1 });
    expect(outcome.report.errors).toEqual([
      expect.objectContaining({ row: 3, code: "duplicate_email" }),
    ]);
    expect(member("ruth@ascend.test")?.services_provided).toEqual(["Meals"]);
  });

  it("skips blank rows instead of calling them errors", async () => {
    const outcome = await importCsv(
      "Email,Skills\nruth@ascend.test,Meals\n,\n\nobed@ascend.test,Meals\n",
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.report.summary).toMatchObject({ created: 2, failed: 0 });
    expect(outcome.report.rows).toBe(2);
  });

  it("leaves no half-written account behind when a row's write fails", async () => {
    db.failNextAuditCreate(new Error("connection terminated"));

    const outcome = await importCsv(
      "Email,Skills\nruth@ascend.test,Meals\nobed@ascend.test,Home repair\n",
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.report.errors).toEqual([
      expect.objectContaining({ row: 2, code: "write_failed" }),
    ]);
    expect(member("ruth@ascend.test")).toBeUndefined();
    // One bad row must not stop the batch.
    expect(member("obed@ascend.test")).toBeDefined();
    expect(outcome.report.summary).toMatchObject({ created: 1, failed: 1 });
  });

  it("records one import summary in the audit trail, counts only", async () => {
    await importVolunteers({
      filename: "volunteers.csv",
      bytes: CSV_FIXTURE,
      actorId: admin.id,
    });

    expect(db.auditLogs.filter((row) => row.action === VOLUNTEER_IMPORT_ACTION)).toEqual([
      expect.objectContaining({
        actorId: admin.id,
        metadata: expect.objectContaining({
          filename: "volunteers.csv",
          rows: 5,
          created: 2,
          merged: 1,
          unchanged: 0,
          failed: 2,
        }),
      }),
    ]);
  });

  it("keeps member email addresses out of the structured log", async () => {
    await importVolunteers({
      filename: "volunteers.csv",
      bytes: CSV_FIXTURE,
      actorId: admin.id,
    });

    const importLines = vi
      .mocked(log)
      .mock.calls.map(([fields]) => fields as Record<string, unknown>)
      .filter((fields) => fields.msg === "volunteer_import_completed");

    expect(importLines).toHaveLength(1);
    expect(importLines[0]).toMatchObject({
      actorId: admin.id,
      file_type: "csv",
      created: 2,
      merged: 1,
      failed: 2,
    });
    expect(JSON.stringify(importLines)).not.toContain(volunteer.email);
  });
});

describe("POST /api/admin/users/import", () => {
  it("imports the uploaded sheet for an admin and reports what it did", async () => {
    const response = await upload(CSV_FIXTURE, "volunteers.csv");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as {
      summary: Record<string, number>;
      errors: { row: number; code: string }[];
    };
    expect(body.summary).toEqual({ created: 2, merged: 1, unchanged: 0, failed: 2 });
    expect(body.errors.map((error) => error.code)).toEqual([
      "invalid_email",
      "missing_email",
    ]);
  });

  it("accepts the XLSX sample over the same endpoint", async () => {
    const response = await upload(XLSX_FIXTURE, "volunteers.xlsx");

    expect(response.status).toBe(200);
    const body = (await response.json()) as { summary: Record<string, number> };
    expect(body.summary).toMatchObject({ created: 2, merged: 1 });
  });

  it("rejects a file type it cannot parse without touching the directory", async () => {
    const response = await upload(CSV_FIXTURE, "volunteers.pdf");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "unsupported_file_type" });
    expect(db.users).toHaveLength(2);
  });

  it("rejects an upload with no file part", async () => {
    const response = await upload(CSV_FIXTURE, "volunteers.csv", "sheet");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "missing_file" });
  });

  it("forbids a SERVER session and imports nothing", async () => {
    signIn(volunteer);

    const response = await upload(CSV_FIXTURE, "volunteers.csv");

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
    expect(db.users).toHaveLength(2);
    expect(db.auditLogs).toEqual([]);
  });

  it("forbids a stale ADMIN cookie once the role was revoked in the database", async () => {
    signInWithStaleAdminCookie(volunteer);

    const response = await upload(CSV_FIXTURE, "volunteers.csv");

    expect(response.status).toBe(403);
    expect(db.users).toHaveLength(2);
  });

  it("requires a session before it reads the upload", async () => {
    signOut();

    const response = await upload(CSV_FIXTURE, "volunteers.csv");

    expect(response.status).toBe(401);
    expect(db.users).toHaveLength(2);
  });

  it("reports a failed import without leaking a row", async () => {
    failUserLookup(new Error("connection terminated"));

    const response = await upload(CSV_FIXTURE, "volunteers.csv");

    expect(response.status).toBe(200);
    const body = (await response.json()) as { summary: Record<string, number> };
    expect(body.summary).toMatchObject({ created: 0, failed: 5 });
    expect(loggedText()).toContain("connection terminated");
    expect(loggedText()).not.toContain(volunteer.email);
  });
});

/**
 * Makes the lookup-by-email the upsert runs throw, as a dead database would.
 * Lookups by id still work, so the role guard is unaffected and the failure
 * lands where an import row would really hit it.
 */
function failUserLookup(error: Error): void {
  const client = db.client as {
    user: {
      findUnique: (args: { where: { id?: string; email?: string } }) => Promise<unknown>;
    };
  };
  const original = client.user.findUnique.bind(client.user);
  client.user.findUnique = (args) =>
    args.where.email === undefined ? original(args) : Promise.reject(error);
}
