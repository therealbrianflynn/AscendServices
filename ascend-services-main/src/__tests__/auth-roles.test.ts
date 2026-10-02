import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { APP_ROLES, isAppRole, parseAppRole } from "@/lib/auth/roles";

const schema = readFileSync(
  path.join(__dirname, "../../prisma/schema.prisma"),
  "utf8",
);

describe("app role enum", () => {
  it("matches the Prisma Role enum exactly (SERVER | ADMIN)", () => {
    const body = schema.match(/enum Role \{([^}]*)\}/)?.[1];
    expect(body).toBeDefined();
    const schemaRoles = body!
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("//"));
    expect(schemaRoles).toEqual(["SERVER", "ADMIN"]);
    expect([...APP_ROLES]).toEqual(schemaRoles);
  });

  it("accepts only known roles", () => {
    expect(isAppRole("SERVER")).toBe(true);
    expect(isAppRole("ADMIN")).toBe(true);
    expect(isAppRole("OWNER")).toBe(false);
    expect(isAppRole("server")).toBe(false);
    expect(isAppRole(undefined)).toBe(false);
  });

  it("throws when parsing an unknown role", () => {
    expect(parseAppRole("ADMIN")).toBe("ADMIN");
    expect(() => parseAppRole("SUPERUSER")).toThrow(/role/i);
  });
});
