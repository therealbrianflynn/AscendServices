import { InvalidEmailError, normalizeEmail } from "@/lib/auth/email-address";

import { fieldForHeader, type VolunteerImportField } from "./contract";
import { isBlankRow, type VolunteerImportTable } from "./parse";
import { splitSkills } from "./skills";

/**
 * Turns a parsed sheet into the rows the upsert can apply, plus one error per
 * row it cannot. Validation happens before any write so a sheet's bad rows are
 * named up front; they never become half-applied accounts.
 */

export type VolunteerImportRowErrorCode =
  | "missing_email"
  | "invalid_email"
  | "duplicate_email"
  | "write_failed";

export interface VolunteerImportRowError {
  /** 1-based line (CSV) or sheet row (XLSX) the admin can go and fix. */
  row: number;
  code: VolunteerImportRowErrorCode;
  /** Admin-facing sentence. Shown in the console; never written to a log. */
  message: string;
}

export interface VolunteerImportRow {
  row: number;
  /** Normalised (trimmed, lower-cased) — the key the upsert matches on. */
  email: string;
  name: string | null;
  services_provided: string[];
  bio: string | null;
}

export interface VolunteerImportRows {
  rows: VolunteerImportRow[];
  errors: VolunteerImportRowError[];
}

export function rowErrorMessage(
  code: VolunteerImportRowErrorCode,
  context: { row: number; value?: string; firstRow?: number },
): string {
  switch (code) {
    case "missing_email":
      return `Row ${context.row}: no email address, so there is no account to match.`;
    case "invalid_email":
      return `Row ${context.row}: "${context.value ?? ""}" is not a valid email address.`;
    case "duplicate_email":
      return `Row ${context.row}: this address is already on row ${context.firstRow}; only the first row was applied.`;
    case "write_failed":
      return `Row ${context.row}: could not be saved, so nothing was changed for it.`;
  }
}

/**
 * Reads every data row. Blank rows are skipped silently — a spacer at the
 * bottom of a spreadsheet is not an error anyone needs to act on — and a
 * repeated address is rejected rather than merged twice, because the second
 * row's intent (add to the first, or replace it?) is genuinely ambiguous.
 */
export function readVolunteerImportRows(table: VolunteerImportTable): VolunteerImportRows {
  const fields = table.headers.map(fieldForHeader);
  const rows: VolunteerImportRow[] = [];
  const errors: VolunteerImportRowError[] = [];
  const seen = new Map<string, number>();

  for (const line of table.rows) {
    if (isBlankRow(line.cells)) continue;

    const cell = (field: VolunteerImportField) => readCell(line.cells, fields, field);
    const rawEmail = cell("email");

    if (rawEmail.length === 0) {
      errors.push(rowError("missing_email", { row: line.row }));
      continue;
    }

    let email: string;
    try {
      email = normalizeEmail(rawEmail);
    } catch (err) {
      if (!(err instanceof InvalidEmailError)) throw err;
      errors.push(rowError("invalid_email", { row: line.row, value: rawEmail }));
      continue;
    }

    const firstRow = seen.get(email);
    if (firstRow !== undefined) {
      errors.push(rowError("duplicate_email", { row: line.row, firstRow }));
      continue;
    }
    seen.set(email, line.row);

    rows.push({
      row: line.row,
      email,
      name: optional(cell("name")),
      services_provided: splitSkills(cell("services_provided")),
      bio: optional(cell("bio")),
    });
  }

  return { rows, errors };
}

/**
 * A sheet may repeat a column (two "Skills" columns is a common export shape);
 * every cell mapped to the field contributes.
 */
function readCell(
  cells: string[],
  fields: (VolunteerImportField | null)[],
  field: VolunteerImportField,
): string {
  const values = fields
    .map((candidate, index) => (candidate === field ? (cells[index] ?? "").trim() : ""))
    .filter((value) => value.length > 0);

  return values.join(field === "services_provided" ? ", " : " ").trim();
}

function optional(value: string): string | null {
  return value.length > 0 ? value : null;
}

function rowError(
  code: VolunteerImportRowErrorCode,
  context: { row: number; value?: string; firstRow?: number },
): VolunteerImportRowError {
  return { row: context.row, code, message: rowErrorMessage(code, context) };
}
