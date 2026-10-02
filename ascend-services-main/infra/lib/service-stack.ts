import path from "node:path";

import * as cdk from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as logs from "aws-cdk-lib/aws-logs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

import type { DeployConfig } from "./deploy-config";
import type { DatabaseStack } from "./database-stack";

export interface ServiceStackProps extends cdk.StackProps {
  readonly vpc: ec2.IVpc;
  readonly database: DatabaseStack;
  readonly config: DeployConfig;
  /** Tests inject a registry image so synth does not build the Dockerfile. */
  readonly containerImage?: ecs.ContainerImage;
}

const DB_NAME = "ascend_services";
const WEB_CONTAINER = "web";
const SLA_CONTAINER = "sla";

export class ServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ServiceStackProps) {
    super(scope, id, props);

    const image = props.containerImage ?? ecs.ContainerImage.fromAsset(repoRoot(), { file: "Dockerfile" });
    const domainZone = props.config.hostedZoneName
      ? route53.HostedZone.fromLookup(this, "Zone", { domainName: props.config.hostedZoneName })
      : undefined;
    const certificate = resolveCertificate(this, props.config, domainZone);

    const cluster = new ecs.Cluster(this, "Cluster", { vpc: props.vpc });
    const appSecurityGroup = new ec2.SecurityGroup(this, "AppSecurityGroup", {
      vpc: props.vpc,
      description: "Ascend Services tasks (web and SLA monitor)",
      allowAllOutbound: true,
    });
    allowDatabaseAccess(this, props.database, appSecurityGroup);
    const sessionSecret = new secretsmanager.Secret(this, "SessionSecret", {
      description: "HMAC key for ascend_session cookies",
      generateSecretString: {
        passwordLength: 48,
        excludePunctuation: true,
      },
    });
    sessionSecret.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    const webLogs = new logs.LogGroup(this, "WebLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const secrets = containerSecrets(props.database.credentialsSecret, sessionSecret);
    const environment = containerEnvironment(props.database);

    const web = new ecsPatterns.ApplicationLoadBalancedFargateService(this, "Web", {
      cluster,
      cpu: 512,
      memoryLimitMiB: 1024,
      desiredCount: props.config.desiredCount,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      circuitBreaker: { rollback: true },
      healthCheckGracePeriod: cdk.Duration.seconds(180),
      publicLoadBalancer: true,
      openListener: true,
      assignPublicIp: false,
      enableExecuteCommand: true,
      securityGroups: [appSecurityGroup],
      taskSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      certificate,
      sslPolicy: certificate ? elbv2.SslPolicy.RECOMMENDED : undefined,
      redirectHTTP: certificate !== undefined,
      domainName: domainZone ? props.config.domainName : undefined,
      domainZone,
      taskImageOptions: {
        image,
        containerName: WEB_CONTAINER,
        containerPort: 3000,
        environment,
        secrets,
        logDriver: ecs.LogDrivers.awsLogs({ logGroup: webLogs, streamPrefix: "web" }),
      },
    });

    web.targetGroup.configureHealthCheck({
      path: "/api/health",
      healthyHttpCodes: "200",
      interval: cdk.Duration.seconds(30),
      timeout: cdk.Duration.seconds(10),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 5,
    });
    const targetGroup = web.targetGroup.node.defaultChild;
    if (!(targetGroup instanceof elbv2.CfnTargetGroup)) {
      throw new Error("Load balancer target group is missing");
    }
    // The pattern registers targets on the listener port. The process listens on 3000.
    targetGroup.port = 3000;

    const appBaseUrl = resolveAppBaseUrl(props.config, web.loadBalancer);
    const webContainer = web.taskDefinition.findContainer(WEB_CONTAINER);
    if (!webContainer) {
      throw new Error("Web task is missing its container");
    }
    webContainer.addEnvironment("APP_BASE_URL", appBaseUrl);

    const slaLogs = new logs.LogGroup(this, "SlaLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const slaTask = new ecs.FargateTaskDefinition(this, "SlaTask", {
      cpu: 256,
      memoryLimitMiB: 512,
    });
    const slaContainer = slaTask.addContainer(SLA_CONTAINER, {
      image,
      environment,
      secrets,
      logging: ecs.LogDrivers.awsLogs({ logGroup: slaLogs, streamPrefix: "sla" }),
      entryPoint: ["sh", "./scripts/run-sla.sh"],
    });
    slaContainer.addEnvironment("APP_BASE_URL", appBaseUrl);

    new events.Rule(this, "SlaSchedule", {
      description: "Quarter-hourly Ascend Services SLA monitor",
      schedule: events.Schedule.rate(cdk.Duration.minutes(15)),
      targets: [
        new targets.EcsTask({
          cluster,
          taskDefinition: slaTask,
          subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
          securityGroups: [appSecurityGroup],
        }),
      ],
    });

    new cloudwatch.Alarm(this, "UnhealthyTargets", {
      metric: web.targetGroup.metrics.unhealthyHostCount({ period: cdk.Duration.minutes(1) }),
      threshold: 1,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "The load balancer has an unhealthy Ascend Services task",
    });

    const scaling = web.service.autoScaleTaskCount({
      minCapacity: props.config.desiredCount,
      maxCapacity: props.config.desiredCount * 2,
    });
    scaling.scaleOnCpuUtilization("Cpu", { targetUtilizationPercent: 70 });

    new cdk.CfnOutput(this, "AppUrl", { value: appBaseUrl });
    new cdk.CfnOutput(this, "LoadBalancerDns", { value: web.loadBalancer.loadBalancerDnsName });
    new cdk.CfnOutput(this, "ClusterName", { value: cluster.clusterName });
    new cdk.CfnOutput(this, "ServiceName", { value: web.service.serviceName });
  }
}

function allowDatabaseAccess(
  scope: Construct,
  database: DatabaseStack,
  appSecurityGroup: ec2.ISecurityGroup,
): void {
  const databaseSecurityGroup = database.instance.connections.securityGroups[0];
  if (!databaseSecurityGroup) {
    throw new Error("Database is missing its security group");
  }
  // The rule lives in this stack. Putting it on the database stack would make
  // the two stacks depend on each other.
  new ec2.CfnSecurityGroupIngress(scope, "DatabaseIngress", {
    groupId: databaseSecurityGroup.securityGroupId,
    sourceSecurityGroupId: appSecurityGroup.securityGroupId,
    ipProtocol: "tcp",
    fromPort: 5432,
    toPort: 5432,
    description: "Fargate tasks",
  });
}

function repoRoot(): string {
  return path.resolve(__dirname, "..", "..");
}

function resolveCertificate(
  scope: Construct,
  config: DeployConfig,
  zone: route53.IHostedZone | undefined,
): acm.ICertificate | undefined {
  if (config.certificateArn) {
    return acm.Certificate.fromCertificateArn(scope, "Certificate", config.certificateArn);
  }
  if (!config.domainName || !zone) return undefined;
  return new acm.Certificate(scope, "Certificate", {
    domainName: config.domainName,
    validation: acm.CertificateValidation.fromDns(zone),
  });
}

function resolveAppBaseUrl(config: DeployConfig, loadBalancer: elbv2.IApplicationLoadBalancer): string {
  if (config.domainName) {
    return `https://${config.domainName}`;
  }
  return cdk.Fn.join("", ["http://", loadBalancer.loadBalancerDnsName]);
}

function containerEnvironment(database: DatabaseStack): Record<string, string> {
  return {
    NODE_ENV: "production",
    PORT: "3000",
    EMAIL_TRANSPORT: "log",
    EMAIL_FROM: "no-reply@ascend.local",
    AUTH_SESSION_TTL_HOURS: "24",
    MAGIC_LINK_TTL_MINUTES: "15",
    WEBAUTHN_RP_NAME: "Ascend Services",
    DB_HOST: database.instance.dbInstanceEndpointAddress,
    DB_PORT: database.instance.dbInstanceEndpointPort,
    DB_NAME,
  };
}

function containerSecrets(
  databaseSecret: secretsmanager.ISecret,
  sessionSecret: secretsmanager.ISecret,
): Record<string, ecs.Secret> {
  return {
    DB_USER: ecs.Secret.fromSecretsManager(databaseSecret, "username"),
    DB_PASSWORD: ecs.Secret.fromSecretsManager(databaseSecret, "password"),
    AUTH_SESSION_SECRET: ecs.Secret.fromSecretsManager(sessionSecret),
  };
}
