/**
 * Structured JSON log stub — single-line JSON for log aggregators.
 * Never log secrets, tokens, or street addresses.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  msg: string;
  level?: LogLevel;
  requestId?: string;
  actorId?: string;
  action?: string;
  [key: string]: unknown;
}

export function log(fields: LogFields): void {
  const { level = "info", msg, ...rest } = fields;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...rest,
  });
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}
