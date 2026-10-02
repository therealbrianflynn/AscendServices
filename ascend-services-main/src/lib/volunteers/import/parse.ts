import { parse as parseCsv } from "csv-parse/sync";
import ExcelJS from "exceljs";

import {
  VOLUNTEER_IMPORT_MAX_BYTES,
  VOLUNTEER_IMPORT_MAX_ROWS,
  fieldForHeader,
} from "./contract";

/**
 * Reads a `.csv` or `.xlsx` upload into one shape — a header row plus data rows
 * that remember the line number they came from — so the rest of the import
 * pipeline never has to care which format the ministry exported.
 *
 * Every rejection here is whole-file: a sheet we cannot read, or one with no
 * email column, is a mistake to hand back to the admin rather than a batch to
 * half-apply.
 */

export type VolunteerImportFileType = "csv" | "xlsx";

export type VolunteerImportFileError =
  | "unsupported_file_type"
  | "file_too_large"
  | "empty_file"
  | "unreadable_file"
  | "missing_email_column"
  | "no_data_rows"
  | "too_many_rows";

export interface VolunteerImportTableRow {
  /** 1-based line (CSV) or sheet row (XLSX), so an error can name it. */
  row: number;
  cells: string[];
}

export interface VolunteerImportTable {
  fileType: VolunteerImportFileType;
  headers: string[];
  rows: VolunteerImportTableRow[];
}

export interface ReadVolunteerImportTableInput {
  filename: string;
  bytes: Buffer;
}

export type ReadVolunteerImportTableResult =
  | { ok: true; table: VolunteerImportTable }
  | { ok: false; error: VolunteerImportFileError };

export async function readVolunteerImportTable({
  filename,
  bytes,
}: ReadVolunteerImportTableInput): Promise<ReadVolunteerImportTableResult> {
  if (bytes.length === 0) return { ok: false, error: "empty_file" };
  if (bytes.length > VOLUNTEER_IMPORT_MAX_BYTES) {
    return { ok: false, error: "file_too_large" };
  }

  const fileType = fileTypeFor(filename);
  if (!fileType) return { ok: false, error: "unsupported_file_type" };

  let lines: VolunteerImportTableRow[];
  try {
    lines = fileType === "csv" ? readCsvLines(bytes) : await readSheetLines(bytes);
  } catch {
    // Both parsers throw on a corrupt or truncated file; either way the admin
    // needs to fix the export, and we have nothing safe to apply.
    return { ok: false, error: "unreadable_file" };
  }

  const [header, ...dataLines] = lines;
  if (!header) return { ok: false, error: "empty_file" };

  const headers = header.cells;
  if (!headers.some((cell) => fieldForHeader(cell) === "email")) {
    return { ok: false, error: "missing_email_column" };
  }
  if (dataLines.length === 0) return { ok: false, error: "no_data_rows" };
  if (dataLines.length > VOLUNTEER_IMPORT_MAX_ROWS) {
    return { ok: false, error: "too_many_rows" };
  }

  return {
    ok: true,
    table: {
      fileType,
      headers,
      rows: dataLines.map((line) => ({
        row: line.row,
        cells: padTo(line.cells, headers.length),
      })),
    },
  };
}

export function fileTypeFor(filename: string): VolunteerImportFileType | null {
  const lowered = filename.trim().toLowerCase();
  if (lowered.endsWith(".csv")) return "csv";
  if (lowered.endsWith(".xlsx")) return "xlsx";
  return null;
}

/** True when every cell is blank — a spacer row, not a row the admin meant. */
export function isBlankRow(cells: string[]): boolean {
  return cells.every((cell) => cell.trim().length === 0);
}

interface CsvRecordWithInfo {
  record: string[];
  info: { lines: number };
}

function readCsvLines(bytes: Buffer): VolunteerImportTableRow[] {
  const records = parseCsv(bytes.toString("utf8"), {
    bom: true,
    // Carries each record's line number, so an error can name the line the
    // admin sees in their editor rather than an index into the parsed rows.
    info: true,
    // Ragged rows are normal in hand-edited sheets; a short row is a blank
    // cell, not a reason to reject the file.
    relax_column_count: true,
    // Mixed endings survive a round trip through Windows, macOS and Linux.
    record_delimiter: ["\r\n", "\n", "\r"],
    skip_empty_lines: true,
  }) as unknown as CsvRecordWithInfo[];

  return records.map(({ record, info }) => ({ row: info.lines, cells: record }));
}

async function readSheetLines(bytes: Buffer): Promise<VolunteerImportTableRow[]> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS types its reader against `ArrayBuffer`, not Node's `Buffer`.
  await workbook.xlsx.load(toArrayBuffer(bytes));

  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const width = sheet.columnCount;
  const lines: VolunteerImportTableRow[] = [];

  sheet.eachRow((row, rowNumber) => {
    const cells: string[] = [];
    for (let column = 1; column <= width; column += 1) {
      cells.push(cellText(row.getCell(column).text));
    }
    // `eachRow` already skips rows the sheet never wrote to; this drops the
    // ones a person emptied but left behind.
    if (!isBlankRow(cells)) lines.push({ row: rowNumber, cells });
  });

  return lines;
}

function toArrayBuffer(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

/** Excel hands back formatted text for dates and numbers; normalise to a string. */
function cellText(value: string | undefined): string {
  return typeof value === "string" ? value : "";
}

function padTo(cells: string[], width: number): string[] {
  if (cells.length >= width) return cells;
  return [...cells, ...Array.from({ length: width - cells.length }, () => "")];
}
