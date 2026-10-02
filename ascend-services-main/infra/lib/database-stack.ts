import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

export interface DatabaseStackProps extends cdk.StackProps {
  readonly vpc: ec2.IVpc;
  readonly deletionProtection: boolean;
}

const DB_NAME = "ascend_services";
const DB_USER = "ascend";

export class DatabaseStack extends cdk.Stack {
  readonly instance: rds.DatabaseInstance;
  readonly credentialsSecret: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    this.instance = new rds.DatabaseInstance(this, "Database", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_13,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      credentials: rds.Credentials.fromGeneratedSecret(DB_USER, {
        excludeCharacters: " %+~`#$&*()|[]{}:;<>?!'/@\"\\",
      }),
      databaseName: DB_NAME,
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      backupRetention: cdk.Duration.days(7),
      deletionProtection: props.deletionProtection,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      publiclyAccessible: false,
      multiAz: false,
      autoMinorVersionUpgrade: true,
      cloudwatchLogsExports: ["postgresql"],
    });

    const secret = this.instance.secret;
    if (!secret) {
      throw new Error("RDS did not create a credentials secret");
    }
    this.credentialsSecret = secret;

    new cdk.CfnOutput(this, "DatabaseSecretArn", {
      value: secret.secretArn,
      description: "Secrets Manager ARN for the Postgres master user",
    });
  }
}
