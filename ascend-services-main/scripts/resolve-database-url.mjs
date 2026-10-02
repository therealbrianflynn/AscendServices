/**
 * Builds the Prisma connection string.
 *
 * Local Docker Compose sets DATABASE_URL directly. On ECS the password is a
 * Secrets Manager value injected as DB_PASSWORD, and the host is the RDS
 * endpoint, so the URL has to be assembled at process start.
 */

export function resolveDatabaseUrl(env) {
  if (env === null || typeof env !== "object") {
    throw new Error("env is required");
  }

  const existing = typeof env.DATABASE_URL === "string" ? env.DATABASE_URL.trim() : "";
  if (existing) return existing;

  const host = required(env, "DB_HOST");
  const user = required(env, "DB_USER");
  const password = required(env, "DB_PASSWORD");
  const name = required(env, "DB_NAME");
  const port = typeof env.DB_PORT === "string" && env.DB_PORT.trim() !== "" ? env.DB_PORT.trim() : "5432";
  if (!/^\d+$/.test(port)) {
    throw new Error(`DB_PORT must be a positive integer (got "${port}")`);
  }

  const userInfo = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`;
  return `postgresql://${userInfo}@${host}:${port}/${encodeURIComponent(name)}?schema=public`;
}

function required(env, name) {
  const value = env[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required when DATABASE_URL is not set`);
  }
  return value.trim();
}

const invokedDirectly = (process.argv[1] ?? "").endsWith("resolve-database-url.mjs");
if (invokedDirectly) {
  try {
    process.stdout.write(resolveDatabaseUrl(process.env));
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}
