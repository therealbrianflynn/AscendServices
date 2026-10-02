import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  REQUEST_STATUSES,
  REQUEST_STATUS_DESCRIPTIONS,
  REQUEST_STATUS_LABELS,
  isRequestStatus,
  parseRequestStatus,
} from "@/lib/requests/status";

const schema = readFileSync(path.join(__dirname, "../../prisma/schema.prisma"), "utf8");

describe("request status enum", () => {
  it("matches the Prisma RequestStatus enum exactly", () => {
    const body = schema.match(/enum RequestStatus \{([^}]*)\}/)?.[1];
    expect(body).toBeDefined();
    const schemaValues = body!
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("//"));
    expect([...REQUEST_STATUSES]).toEqual(schemaValues);
  });

  it("has requester-facing copy for every status", () => {
    for (const status of REQUEST_STATUSES) {
      expect(REQUEST_STATUS_LABELS[status]).toBeTruthy();
      expect(REQUEST_STATUS_DESCRIPTIONS[status]).toBeTruthy();
    }
  });

  it("accepts only known statuses", () => {
    expect(isRequestStatus("NEW")).toBe(true);
    expect(isRequestStatus("COMPLETED")).toBe(false);
    expect(isRequestStatus("new")).toBe(false);
    expect(parseRequestStatus("COMPLETE")).toBe("COMPLETE");
    expect(() => parseRequestStatus("CANCELLED")).toThrow(/status/i);
  });
});
