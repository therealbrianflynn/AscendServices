export class DeployConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeployConfigError";
  }
}

export interface DeployConfig {
  readonly domainName: string | undefined;
  readonly hostedZoneName: string | undefined;
  readonly certificateArn: string | undefined;
  readonly deletionProtection: boolean;
  readonly desiredCount: number;
}

const DEFAULT_DESIRED_COUNT = 1;
const MAX_DESIRED_COUNT = 10;

/**
 * Reads deploy settings from CDK context (`-c key=value`). Context values
 * arrive as strings, so booleans and counts are parsed here rather than cast.
 */
export function parseDeployConfig(source: Readonly<Record<string, unknown>>): DeployConfig {
  const domainName = optionalString(source, "domainName");
  const hostedZoneName = optionalString(source, "hostedZoneName");
  const certificateArn = optionalString(source, "certificateArn");
  const deletionProtection = optionalBoolean(source, "deletionProtection", true);
  const desiredCount = optionalPositiveInt(source, "desiredCount", DEFAULT_DESIRED_COUNT);

  if (domainName && !hostedZoneName && !certificateArn) {
    throw new DeployConfigError(
      "domainName requires hostedZoneName (to create a certificate) or certificateArn",
    );
  }
  if (certificateArn && !domainName) {
    throw new DeployConfigError("certificateArn requires domainName so the site is served over HTTPS");
  }
  if (hostedZoneName && !domainName) {
    throw new DeployConfigError("hostedZoneName requires domainName");
  }
  if (desiredCount > MAX_DESIRED_COUNT) {
    throw new DeployConfigError(`desiredCount must be ${MAX_DESIRED_COUNT} or less`);
  }

  return { domainName, hostedZoneName, certificateArn, deletionProtection, desiredCount };
}

function optionalString(source: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = source[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new DeployConfigError(`${key} must be a string`);
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function optionalBoolean(
  source: Readonly<Record<string, unknown>>,
  key: string,
  fallback: boolean,
): boolean {
  const value = source[key];
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new DeployConfigError(`${key} must be true or false`);
}

function optionalPositiveInt(
  source: Readonly<Record<string, unknown>>,
  key: string,
  fallback: number,
): number {
  const value = source[key];
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new DeployConfigError(`${key} must be a positive integer`);
  }
  return parsed;
}
