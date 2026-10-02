#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";

import { DatabaseStack } from "../lib/database-stack";
import { parseDeployConfig } from "../lib/deploy-config";
import { NetworkStack } from "../lib/network-stack";
import { ServiceStack } from "../lib/service-stack";

const app = new cdk.App();

const config = parseDeployConfig({
  domainName: app.node.tryGetContext("domainName"),
  hostedZoneName: app.node.tryGetContext("hostedZoneName"),
  certificateArn: app.node.tryGetContext("certificateArn"),
  deletionProtection: app.node.tryGetContext("deletionProtection"),
  desiredCount: app.node.tryGetContext("desiredCount"),
});

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const network = new NetworkStack(app, "AscendNetwork", {
  env,
  description: "VPC for Ascend Services",
});

const database = new DatabaseStack(app, "AscendDatabase", {
  env,
  description: "Postgres for Ascend Services",
  vpc: network.vpc,
  deletionProtection: config.deletionProtection,
});

new ServiceStack(app, "AscendService", {
  env,
  description: "Fargate service, load balancer, and SLA schedule for Ascend Services",
  vpc: network.vpc,
  database,
  config,
});

cdk.Tags.of(app).add("Project", "ascend-services");
