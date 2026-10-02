import { describe, expect, it } from "vitest";

import {
  InvalidRequestInputError,
  REQUEST_FIELD_MAX_LENGTHS,
  parseHelpRequestInput,
} from "@/lib/requests/input";

const SERVICE_TYPES = ["Yard work", "Meals", "Other"] as const;

function submission(overrides: Record<string, unknown> = {}) {
  return {
    requester_name: "Ruth Boaz",
    service_type: "Yard work",
    neighborhood: "Eastside",
    street_address: "412 Harvest Lane",
    ...overrides,
  };
}

function parse(raw: unknown) {
  return parseHelpRequestInput(raw, { serviceTypes: SERVICE_TYPES });
}

function fieldErrors(raw: unknown): Record<string, string> {
  try {
    parse(raw);
  } catch (err) {
    if (err instanceof InvalidRequestInputError) return err.fieldErrors;
    throw err;
  }
  throw new Error("expected InvalidRequestInputError");
}

describe("parseHelpRequestInput", () => {
  it("accepts the Spec v6 form fields and defaults the prayer toggle to private", () => {
    expect(parse(submission())).toEqual({
      requester_name: "Ruth Boaz",
      requester_email: null,
      service_type: "Yard work",
      neighborhood: "Eastside",
      street_address: "412 Harvest Lane",
      prayer_request: null,
      prayer_private: true,
    });
  });

  it("normalises an optional contact email used for the connection introduction", () => {
    expect(
      parse(submission({ requester_email: "  Ruth.Boaz@Example.COM " })),
    ).toMatchObject({ requester_email: "ruth.boaz@example.com" });
  });

  it("rejects a malformed contact email rather than storing an undeliverable one", () => {
    expect(fieldErrors(submission({ requester_email: "ruth at example" }))).toEqual({
      requester_email: "invalid",
    });
  });

  it("keeps an optional prayer request and honours an opt-in to share it", () => {
    expect(
      parse(
        submission({
          prayer_request: "  Please pray for my mother.  ",
          prayer_private: false,
        }),
      ),
    ).toMatchObject({
      prayer_request: "Please pray for my mother.",
      prayer_private: false,
    });
  });

  it("treats a checkbox 'on' value as private", () => {
    expect(
      parse(submission({ prayer_request: "Peace", prayer_private: "on" })),
    ).toMatchObject({ prayer_private: true });
  });

  it("stays private when there is no prayer text to share", () => {
    expect(
      parse(submission({ prayer_request: "   ", prayer_private: false })),
    ).toMatchObject({ prayer_request: null, prayer_private: true });
  });

  it("trims surrounding whitespace on every text field", () => {
    expect(
      parse(
        submission({
          requester_name: "  Ruth Boaz ",
          neighborhood: "\tEastside\n",
          street_address: " 412 Harvest Lane ",
        }),
      ),
    ).toMatchObject({
      requester_name: "Ruth Boaz",
      neighborhood: "Eastside",
      street_address: "412 Harvest Lane",
    });
  });

  it("reports every missing required field at once", () => {
    expect(fieldErrors({})).toEqual({
      requester_name: "required",
      service_type: "required",
      neighborhood: "required",
      street_address: "required",
    });
  });

  it("rejects whitespace-only required fields", () => {
    expect(fieldErrors(submission({ requester_name: "   " }))).toEqual({
      requester_name: "required",
    });
  });

  it("rejects a service type outside the configured catalogue", () => {
    expect(fieldErrors(submission({ service_type: "Skydiving lessons" }))).toEqual({
      service_type: "unsupported",
    });
  });

  it("rejects oversized fields", () => {
    const tooLong = "x".repeat(REQUEST_FIELD_MAX_LENGTHS.street_address + 1);
    expect(fieldErrors(submission({ street_address: tooLong }))).toEqual({
      street_address: "too_long",
    });
  });

  it("rejects non-object payloads", () => {
    expect(() => parse("not an object")).toThrow(InvalidRequestInputError);
    expect(() => parse(null)).toThrow(InvalidRequestInputError);
  });

  it("never echoes submitted values back in the error codes", () => {
    const errors = fieldErrors(
      submission({ service_type: "Skydiving lessons", street_address: "" }),
    );
    expect(JSON.stringify(errors)).not.toContain("Skydiving");
    expect(Object.values(errors).every((code) => /^[a-z_]+$/.test(code))).toBe(true);
  });
});
