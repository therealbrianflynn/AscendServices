import { describe, expect, it } from "vitest";

import { getServiceTypeOptions } from "@/lib/requests/service-types";

describe("service catalogue", () => {
  it("includes counseling and auto mechanic by default", () => {
    const options = getServiceTypeOptions({} as NodeJS.ProcessEnv);
    expect(options).toContain("Counseling");
    expect(options).toContain("Auto Mechanic");
    expect(options).toContain("Handyman");
    expect(options).toContain("Adopt a Military Family");
  });

  it("uses a configured list when one is provided", () => {
    expect(
      getServiceTypeOptions({ REQUEST_SERVICE_TYPES: "Meals, Counseling" } as NodeJS.ProcessEnv),
    ).toEqual(["Meals", "Counseling"]);
  });
});
