import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(
  path.join(__dirname, "../../prisma/schema.prisma"),
  "utf8",
);

describe("Prisma schema Spec v6 smoke", () => {
  it("defines User with role enum and required fields", () => {
    expect(schema).toMatch(/model User/);
    expect(schema).toMatch(/email\s+String\s+@unique/);
    expect(schema).toMatch(/enum Role/);
    expect(schema).toMatch(/SERVER/);
    expect(schema).toMatch(/ADMIN/);
    expect(schema).toMatch(/services_provided/);
    expect(schema).toMatch(/onboarding_token/);
  });

  it("defines Request with status enum and tracking_token", () => {
    expect(schema).toMatch(/model Request/);
    expect(schema).toMatch(/tracking_token\s+String\s+@unique/);
    expect(schema).toMatch(/enum RequestStatus/);
  });

  it("carries the optional prayer request and its privacy toggle", () => {
    const body = schema.match(/model Request \{([^}]*)\}/)?.[1];
    expect(body).toBeDefined();
    expect(body).toMatch(/prayer_request\s+String\?/);
    expect(body).toMatch(/prayer_private\s+Boolean\s+@default\(true\)/);
  });

  it("records who claimed a request and when, without losing history", () => {
    const body = schema.match(/model Request \{([^}]*)\}/)?.[1];
    expect(body).toBeDefined();
    expect(body).toMatch(/assignedToId\s+String\?/);
    expect(body).toMatch(/assignedAt\s+DateTime\?/);
    // A deleted volunteer must not take the request (or its audit trail) down.
    expect(body).toMatch(/onDelete: SetNull/);
    expect(schema).toMatch(/model User \{[\s\S]*?bio\s+String\?[\s\S]*?\n\}/);
  });

  it("declares RequestStatus with exactly the Spec v6 values in order", () => {
    const body = schema.match(/enum RequestStatus \{([^}]*)\}/)?.[1];
    expect(body).toBeDefined();
    const values = body!
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("//"));
    expect(values).toEqual([
      "NEW",
      "ASSIGNED",
      "CONTACT_MADE",
      "IN_PROGRESS",
      "COMPLETE",
    ]);
  });

  it("uses UUID primary keys for User and Request per Spec v6", () => {
    expect(schema).toMatch(/model User \{\s*\n\s*id\s+String\s+@id @default\(uuid\(\)\)/);
    expect(schema).toMatch(/model Request \{\s*\n\s*id\s+String\s+@id @default\(uuid\(\)\)/);
    expect(schema).not.toMatch(/cuid\(\)/);
  });

  it("stores passkeys with the fields WebAuthn verification needs", () => {
    const body = schema.match(/model PasskeyCredential \{([^}]*)\}/)?.[1];
    expect(body).toBeDefined();
    expect(body).toMatch(/credential_id\s+String\s+@unique/);
    expect(body).toMatch(/public_key\s+Bytes/);
    expect(body).toMatch(/counter\s+Int\s+@default\(0\)/);
    // A credential must die with its owner, never outlive them as an orphan.
    expect(body).toMatch(/onDelete: Cascade/);
  });

  it("keeps WebAuthn challenges server-side, single-use and ceremony-scoped", () => {
    const body = schema.match(/model WebAuthnChallenge \{([^}]*)\}/)?.[1];
    expect(body).toBeDefined();
    expect(body).toMatch(/ceremony\s+WebAuthnCeremony/);
    expect(body).toMatch(/expiresAt\s+DateTime/);
    expect(body).toMatch(/consumedAt\s+DateTime\?/);

    const ceremonies = schema.match(/enum WebAuthnCeremony \{([^}]*)\}/)?.[1];
    expect(ceremonies).toMatch(/REGISTRATION/);
    expect(ceremonies).toMatch(/AUTHENTICATION/);
  });

  it("defines AuditLog and SystemSettings with Spec v6 SLA thresholds", () => {
    expect(schema).toMatch(/model AuditLog/);
    expect(schema).toMatch(/actorId/);
    expect(schema).toMatch(/requestId/);
    expect(schema).toMatch(/fromStatus/);
    expect(schema).toMatch(/toStatus/);

    const body = schema.match(/model SystemSettings \{([^}]*)\}/)?.[1];
    expect(body).toBeDefined();
    for (const field of [
      "unassigned_alert_hours",
      "stalled_contact_alert_hours",
      "stalled_progress_days",
    ]) {
      expect(body).toMatch(new RegExp(`${field}\\s+Int\\s+@default\\(\\d+\\)`));
    }
    expect(body).not.toMatch(/minutes/);
  });
});
