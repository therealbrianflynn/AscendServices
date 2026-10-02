import { log } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import {
  fileTypeFor,
  readVolunteerImportTable,
  type VolunteerImportFileError,
  type VolunteerImportFileType,
} from "./parse";
import {
  readVolunteerImportRows,
  rowErrorMessage,
  type VolunteerImportRowError,
} from "./rows";
import { upsertVolunteer, type VolunteerUpsertResult } from "./upsert";

export { VOLUNTEER_IMPORTED_ACTION } from "./upsert";

export const VOLUNTEER_IMPORT_ACTION = "VOLUNTEER_IMPORT";

/** Audit metadata marker: this batch came from the admin console upload. */
const ADMIN_CONSOLE_SOURCE = "admin_console";

export interface VolunteerImportSummary {
  created: number;
  merged: number;
  unchanged: number;
  failed: number;
}

export interface VolunteerImportReport {
  filename: string;
  fileType: VolunteerImportFileType;
  /** Non-blank data rows the sheet contained. */
  rows: number;
  summary: VolunteerImportSummary;
  results: VolunteerUpsertResult[];
  errors: VolunteerImportRowError[];
}

export interface ImportVolunteersInput {
  filename: string;
  bytes: Buffer;
  /** The ADMIN who uploaded the sheet — the audit trail's only actor. */
  actorId: string;
  env?: NodeJS.ProcessEnv;
}

export type ImportVolunteersResult =
  | { ok: true; report: VolunteerImportReport }
  | { ok: false; error: VolunteerImportFileError };

/**
 * The Spec v6 §4 bulk import: parse the sheet, then apply it row by row.
 *
 * Rows are applied individually rather than as one transaction. A batch is a
 * hand-maintained spreadsheet, and one mistyped address should cost the admin
 * that row, not the afternoon's work — so every row either lands whole (account
 * plus audit entry, in its own transaction) or is reported against its line
 * number. The report says exactly what happened to each one; nothing is applied
 * silently and nothing is left half-written.
 */
export async function importVolunteers({
  filename,
  bytes,
  actorId,
  env = process.env,
}: ImportVolunteersInput): Promise<ImportVolunteersResult> {
  const parsed = await readVolunteerImportTable({ filename, bytes });

  if (!parsed.ok) {
    log({
      level: "warn",
      msg: "volunteer_import_rejected",
      action: VOLUNTEER_IMPORT_ACTION,
      actorId,
      file_type: fileTypeFor(filename),
      reason: parsed.error,
    });
    return parsed;
  }

  const { fileType } = parsed.table;
  const { rows, errors } = readVolunteerImportRows(parsed.table);
  const results: VolunteerUpsertResult[] = [];
  const rowErrors = [...errors];

  for (const row of rows) {
    try {
      results.push(await upsertVolunteer(row, actorId, env));
    } catch (err) {
      rowErrors.push({
        row: row.row,
        code: "write_failed",
        message: rowErrorMessage("write_failed", { row: row.row }),
      });
      // The row number, never the row: import failures are as PII-bearing as
      // any other admin path.
      log({
        level: "error",
        msg: "volunteer_import_row_failed",
        action: VOLUNTEER_IMPORT_ACTION,
        actorId,
        row: row.row,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  rowErrors.sort((left, right) => left.row - right.row);

  const summary: VolunteerImportSummary = {
    created: countOutcome(results, "created"),
    merged: countOutcome(results, "merged"),
    unchanged: countOutcome(results, "unchanged"),
    failed: rowErrors.length,
  };
  const report: VolunteerImportReport = {
    filename,
    fileType,
    rows: rows.length + errors.length,
    summary,
    results,
    errors: rowErrors,
  };

  await prisma.auditLog.create({
    data: {
      actorId,
      action: VOLUNTEER_IMPORT_ACTION,
      metadata: {
        source: ADMIN_CONSOLE_SOURCE,
        filename,
        file_type: fileType,
        rows: report.rows,
        ...summary,
      },
    },
  });

  log({
    msg: "volunteer_import_completed",
    action: VOLUNTEER_IMPORT_ACTION,
    actorId,
    file_type: fileType,
    rows: report.rows,
    ...summary,
  });

  return { ok: true, report };
}

function countOutcome(
  results: VolunteerUpsertResult[],
  outcome: VolunteerUpsertResult["outcome"],
): number {
  return results.filter((result) => result.outcome === outcome).length;
}
