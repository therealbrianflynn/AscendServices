import { describe, expect, it } from "vitest";

import {
  ASSIGNMENT_REQUEST_SELECT,
  PUBLIC_REQUEST_SELECT,
  TRACKING_REQUEST_SELECT,
  toAssignmentRequestView,
  toPublicRequestView,
  toTrackingRequestView,
} from "@/lib/requests/views";

const STREET = "412 Harvest Lane";

const record = {
  id: "req-1",
  requester_name: "Ruth Boaz",
  requester_email: "ruth@example.com",
  service_type: "Yard work",
  neighborhood: "Eastside",
  street_address: STREET,
  prayer_request: "Please pray for my mother.",
  prayer_private: true,
  status: "NEW",
  assignedAt: new Date("2026-03-03T10:00:00.000Z"),
  createdAt: new Date("2026-03-01T10:00:00.000Z"),
  updatedAt: new Date("2026-03-02T10:00:00.000Z"),
};

describe("public request view", () => {
  it("exposes only board-safe fields", () => {
    expect(toPublicRequestView(record)).toEqual({
      id: "req-1",
      service_type: "Yard work",
      neighborhood: "Eastside",
      status: "NEW",
      createdAt: "2026-03-01T10:00:00.000Z",
    });
  });

  it("carries no street address, requester name or prayer text", () => {
    const serialized = JSON.stringify(toPublicRequestView(record));
    expect(serialized).not.toContain(STREET);
    expect(serialized).not.toContain("Ruth Boaz");
    expect(serialized).not.toContain("pray");
  });

  it("never selects the private columns from the database", () => {
    expect(PUBLIC_REQUEST_SELECT).not.toHaveProperty("street_address");
    expect(PUBLIC_REQUEST_SELECT).not.toHaveProperty("requester_name");
    expect(PUBLIC_REQUEST_SELECT).not.toHaveProperty("prayer_request");
    expect(PUBLIC_REQUEST_SELECT).not.toHaveProperty("tracking_token");
  });

  it("rejects a status the application does not know", () => {
    expect(() => toPublicRequestView({ ...record, status: "ARCHIVED" })).toThrow(
      /status/i,
    );
  });
});

describe("assignment request view", () => {
  it("gives the matched volunteer the contact details, and nothing more", () => {
    expect(toAssignmentRequestView({ ...record, status: "ASSIGNED" })).toEqual({
      id: "req-1",
      requester_name: "Ruth Boaz",
      requester_email: "ruth@example.com",
      service_type: "Yard work",
      neighborhood: "Eastside",
      street_address: STREET,
      status: "ASSIGNED",
      createdAt: "2026-03-01T10:00:00.000Z",
      assignedAt: "2026-03-03T10:00:00.000Z",
    });
  });

  it("never selects the prayer text or the tracking token for a volunteer", () => {
    expect(ASSIGNMENT_REQUEST_SELECT).not.toHaveProperty("prayer_request");
    expect(ASSIGNMENT_REQUEST_SELECT).not.toHaveProperty("tracking_token");
  });
});

describe("tracking request view", () => {
  it("echoes the requester's own submission back to the token holder", () => {
    expect(toTrackingRequestView(record)).toEqual({
      id: "req-1",
      requester_name: "Ruth Boaz",
      service_type: "Yard work",
      neighborhood: "Eastside",
      street_address: STREET,
      prayer_request: "Please pray for my mother.",
      prayer_private: true,
      status: "NEW",
      createdAt: "2026-03-01T10:00:00.000Z",
      updatedAt: "2026-03-02T10:00:00.000Z",
    });
  });

  it("does not hand the tracking token back out in the payload", () => {
    expect(TRACKING_REQUEST_SELECT).not.toHaveProperty("tracking_token");
    expect(toTrackingRequestView(record)).not.toHaveProperty("tracking_token");
  });
});
