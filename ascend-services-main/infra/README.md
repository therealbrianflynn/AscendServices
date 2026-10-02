# Deploy Ascend Services to AWS

The running site uses the Lightsail server described in `deploy/lightsail`, about $12 a month. Do not `cdk deploy` the stacks in this folder. Those create a NAT gateway, a load balancer, and a separate database, and they cost about $80 a month.

AWS CDK app in this folder. It defines three stacks:

- **AscendNetwork** — VPC across two availability zones. Tasks run in private subnets. Postgres runs in isolated subnets. One NAT gateway gives the tasks a way out to pull the image and write logs.
- **AscendDatabase** — PostgreSQL 16 on RDS (`db.t4g.micro`), encrypted, not publicly reachable. The master password is generated in Secrets Manager. Deletion protection is on unless you turn it off.
- **AscendService** — Fargate service behind an Application Load Balancer, health-checked at `/api/health`. A separate scheduled task runs the SLA monitor every 15 minutes. `AUTH_SESSION_SECRET` and the database password are injected from Secrets Manager; they are not written into the task definition.

`cdk deploy` builds the repo `Dockerfile`, pushes it to ECR, and rolls the service. The container entrypoint runs Prisma migrations before Next.js starts.

Email stays on `EMAIL_TRANSPORT=log`. Outbound mail is written to the web log group, not sent. Passkeys need HTTPS, so set a domain before relying on them. Magic links work either way; copy the link from the logs.

This creates billable resources (NAT gateway, load balancer, Fargate, and RDS). A small single-task deployment is on the order of $80 per month in `us-east-1` before data transfer.

## Prerequisites

- Node.js 22
- Docker, running (the deploy builds the image)
- AWS credentials for the account you want to use
- Once per account and region: `npx cdk bootstrap`

## Deploy

From this folder:

```bash
pnpm install
pnpm test
pnpm exec cdk deploy --all
```

HTTP only, on the load balancer DNS name:

```bash
pnpm exec cdk deploy --all -c deletionProtection=false
```

HTTPS with a Route 53 hosted zone you already have (CDK creates the certificate and the alias record):

```bash
pnpm exec cdk deploy --all \
  -c domainName=ministry.example \
  -c hostedZoneName=example.com
```

HTTPS with a certificate you already issued in this region:

```bash
pnpm exec cdk deploy --all \
  -c domainName=ministry.example \
  -c certificateArn=arn:aws:acm:us-east-1:123456789012:certificate/abc
```

Add `-c hostedZoneName=example.com` as well when that zone is in the same account and you want the alias record created for you.

`pnpm exec cdk deploy` prints `AppUrl` when it finishes.

## After the first deploy

Create the admin user from a one-off command inside the task (ECS Exec is enabled):

```bash
aws ecs execute-command \
  --cluster <ClusterName> \
  --task <task-id> \
  --container web \
  --interactive \
  --command "sh -c 'ADMIN_SEED_EMAIL=you@example.com ./node_modules/.bin/tsx scripts/seed-admin.ts'"
```

Then sign in at `/signin` with that address and copy the magic link from the web log group.

## Tear down

Deletion protection is on by default, and the database removal policy is snapshot. To destroy a disposable environment, deploy once with `-c deletionProtection=false`, then:

```bash
pnpm exec cdk destroy --all
```

The snapshot is left in RDS. The session secret is deleted with the service stack.
