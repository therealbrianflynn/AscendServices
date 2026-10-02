import { describe, expect, it } from "vitest";

import { resolveDatabaseUrl } from "../../scripts/resolve-database-url.mjs";

describe("resolveDatabaseUrl", () => {
  it("keeps an explicit DATABASE_URL", () => {
    const url = resolveDatabaseUrl({
      DATABASE_URL: " postgresql://local/db ",
      DB_HOST: "ignored.example",
    });

    expect(url).toBe("postgresql://local/db");
  });

  it("builds a URL and encodes credentials", () => {
    const url = resolveDatabaseUrl({
      DB_HOST: "db.internal",
      DB_PORT: "5432",
      DB_USER: "ascend",
      DB_PASSWORD: "p@ss word",
      DB_NAME: "ascend_services",
    });

    expect(url).toBe(
      "postgresql://ascend:p%40ss%20word@db.internal:5432/ascend_services?schema=public",
    );
  });

  it("defaults the port to 5432", () => {
    const url = resolveDatabaseUrl({
      DB_HOST: "db.internal",
      DB_USER: "ascend",
      DB_PASSWORD: "secret",
      DB_NAME: "ascend_services",
    });

    expect(url).toContain("@db.internal:5432/");
  });

  it("rejects a missing password", () => {
    expect(() =>
      resolveDatabaseUrl({
        DB_HOST: "db.internal",
        DB_USER: "ascend",
        DB_NAME: "ascend_services",
      }),
    ).toThrow("DB_PASSWORD is required when DATABASE_URL is not set");
  });

  it("rejects a non-numeric port", () => {
    expect(() =>
      resolveDatabaseUrl({
        DB_HOST: "db.internal",
        DB_PORT: "postgres",
        DB_USER: "ascend",
        DB_PASSWORD: "secret",
        DB_NAME: "ascend_services",
      }),
    ).toThrow('DB_PORT must be a positive integer');
  });

  it("rejects a missing env object", () => {
    expect(() => resolveDatabaseUrl(null)).toThrow("env is required");
  });
});
