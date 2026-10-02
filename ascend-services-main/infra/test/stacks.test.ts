import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import * as ecs from "aws-cdk-lib/aws-ecs";
import { describe, expect, it } from "vitest";

import { DatabaseStack } from "../lib/database-stack";
import { parseDeployConfig } from "../lib/deploy-config";
import { NetworkStack } from "../lib/network-stack";
import { ServiceStack } from "../lib/service-stack";

const ENV = { account: "123456789012", region: "us-east-1" };
const TEST_IMAGE = ecs.ContainerImage.fromRegistry("ascend-services:test");

function synthesize(context: Record<string, unknown> = {}) {
  const app = new cdk.App();
  const config = parseDeployConfig(context);
  const network = new NetworkStack(app, "AscendNetwork", { env: ENV });
  const database = new DatabaseStack(app, "AscendDatabase", {
    env: ENV,
    vpc: network.vpc,
    deletionProtection: config.deletionProtection,
  });
  const service = new ServiceStack(app, "AscendService", {
    env: ENV,
    vpc: network.vpc,
    database,
    config,
    containerImage: TEST_IMAGE,
  });
  return {
    network: Template.fromStack(network),
    database: Template.fromStack(database),
    service: Template.fromStack(service),
  };
}

interface ContainerDefinition {
  readonly Environment?: ReadonlyArray<{ Name: string; Value: string }>;
  readonly Secrets?: ReadonlyArray<{ Name: string }>;
  readonly EntryPoint?: ReadonlyArray<string>;
}

function containersOf(template: Template): ContainerDefinition[] {
  const tasks = template.findResources("AWS::ECS::TaskDefinition");
  return Object.values(tasks).flatMap((task) => {
    const properties = task.Properties as { ContainerDefinitions?: ContainerDefinition[] };
    return properties.ContainerDefinitions ?? [];
  });
}

describe("Ascend stacks", () => {
  it("keeps Postgres private, encrypted, and reachable only from the app", () => {
    const { network, database, service } = synthesize();

    network.resourceCountIs("AWS::EC2::NatGateway", 1);
    database.hasResourceProperties("AWS::RDS::DBInstance", {
      Engine: "postgres",
      DBName: "ascend_services",
      PubliclyAccessible: false,
      StorageEncrypted: true,
      DeletionProtection: true,
    });
    service.hasResourceProperties("AWS::EC2::SecurityGroupIngress", {
      IpProtocol: "tcp",
      FromPort: 5432,
      ToPort: 5432,
      Description: "Fargate tasks",
      CidrIp: Match.absent(),
    });
  });

  it("runs the site on Fargate and checks /api/health", () => {
    const { service } = synthesize();

    service.hasResourceProperties("AWS::ECS::Service", {
      DesiredCount: 1,
      LaunchType: "FARGATE",
    });
    service.hasResourceProperties("AWS::ElasticLoadBalancingV2::TargetGroup", {
      HealthCheckPath: "/api/health",
      Matcher: { HttpCode: "200" },
      Port: 3000,
    });
    service.hasResourceProperties("AWS::Events::Rule", {
      ScheduleExpression: "rate(15 minutes)",
    });
    service.hasResourceProperties("AWS::Logs::LogGroup", {
      RetentionInDays: 30,
    });
  });

  it("injects credentials from Secrets Manager instead of the task environment", () => {
    const { service } = synthesize();
    const containers = containersOf(service);

    expect(containers.length).toBeGreaterThanOrEqual(2);
    for (const container of containers) {
      const environmentNames = (container.Environment ?? []).map((entry) => entry.Name);
      expect(environmentNames).not.toContain("AUTH_SESSION_SECRET");
      expect(environmentNames).not.toContain("DB_PASSWORD");
      expect(environmentNames).not.toContain("DATABASE_URL");
      expect(environmentNames).toContain("DB_HOST");

      const secretNames = (container.Secrets ?? []).map((entry) => entry.Name);
      expect(secretNames).toEqual(expect.arrayContaining(["DB_USER", "DB_PASSWORD", "AUTH_SESSION_SECRET"]));
    }

    const sla = containers.find((container) => container.EntryPoint?.[0] === "sh");
    expect(sla?.EntryPoint).toEqual(["sh", "./scripts/run-sla.sh"]);
  });

  it("serves HTTPS and sets APP_BASE_URL from the domain", () => {
    const { service } = synthesize({
      domainName: "ministry.example",
      certificateArn: "arn:aws:acm:us-east-1:123456789012:certificate/abc",
    });

    service.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
      Protocol: "HTTPS",
      Port: 443,
    });

    const bases = containersOf(service).flatMap((container) =>
      (container.Environment ?? [])
        .filter((entry) => entry.Name === "APP_BASE_URL")
        .map((entry) => entry.Value),
    );
    expect(bases).toContain("https://ministry.example");
  });
});
