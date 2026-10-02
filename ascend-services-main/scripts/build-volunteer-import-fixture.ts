/**
 * Rebuilds the `.xlsx` half of the volunteer-import fixture pair from the `.csv`
 * half, so the two sample sheets can never drift apart. Run it after editing the
 * CSV: `pnpm fixtures:volunteer-import`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { parse as parseCsv } from "csv-parse/sync";
import ExcelJS from "exceljs";

const FIXTURE_DIR = path.join(process.cwd(), "src/__fixtures__/volunteer-import");
const CSV_PATH = path.join(FIXTURE_DIR, "volunteers.csv");
const XLSX_PATH = path.join(FIXTURE_DIR, "volunteers.xlsx");
const SHEET_NAME = "Volunteers";

async function main(): Promise<void> {
  const rows = parseCsv(readFileSync(CSV_PATH, "utf8"), {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: true,
  }) as string[][];

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(SHEET_NAME);
  for (const row of rows) sheet.addRow(row);

  await workbook.xlsx.writeFile(XLSX_PATH);
  console.log(`wrote ${XLSX_PATH} (${rows.length} rows including the header)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
