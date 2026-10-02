import { describe, expect, it } from "vitest";

import { DeployConfigError, parseDeployConfig } from "../lib/deploy-config";

describe("parseDeployConfig", () => {
  it("defaults to a protected single task and no domain", () => {
    expect(parseDeployConfig({})).toEqual({
      domainName: undefined,
      hostedZoneName: undefined,
      certificateArn: undefined,
      deletionProtection: true,
      desiredCount: 1,
    });
  });

  it("parses context strings from the CDK CLI", () => {
    expect(
      parseDeployConfig({
        domainName: " ministry.example ",
        certificateArn: "arn:aws:acm:us-east-1:123456789012:certificate/abc",
        deletionProtection: "false",
        desiredCount: "2",
      }),
    ).toMatchObject({
      domainName: "ministry.example",
      deletionProtection: false,
      desiredCount: 2,
    });
  });

  it("rejects a domain with no way to serve HTTPS", () => {
    expect(() => parseDeployConfig({ domainName: "ministry.example" })).toThrow(DeployConfigError);
  });

  it("rejects a certificate without a domain", () => {
    expect(() =>
      parseDeployConfig({ certificateArn: "arn:aws:acm:us-east-1:123456789012:certificate/abc" }),
    ).toThrow("certificateArn requires domainName");
  });

  it("rejects a hosted zone without a domain", () => {
    expect(() => parseDeployConfig({ hostedZoneName: "example.com" })).toThrow(
      "hostedZoneName requires domainName",
    );
  });

  it("rejects a desired count that would scale by accident", () => {
    expect(() => parseDeployConfig({ desiredCount: "11" })).toThrow("10 or less");
    expect(() => parseDeployConfig({ desiredCount: "0" })).toThrow("positive integer");
    expect(() => parseDeployConfig({ deletionProtection: "yes" })).toThrow("true or false");
  });
});
