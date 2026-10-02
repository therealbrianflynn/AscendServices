"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";

import {
  VOLUNTEER_IMPORT_COLUMNS,
  VOLUNTEER_IMPORT_ENDPOINT,
  VOLUNTEER_IMPORT_EXTENSIONS,
  VOLUNTEER_IMPORT_FILE_FIELD,
  VOLUNTEER_IMPORT_MAX_ROWS,
} from "@/lib/volunteers/import/contract";
import type { VolunteerImportReport } from "@/lib/volunteers/import/service";

const FALLBACK_ERROR = "Something went wrong on our side. Please try again.";

/** Maps the API's stable rejection codes to admin-facing copy. */
const UPLOAD_ERRORS: Record<string, string> = {
  missing_file: "Choose a spreadsheet before uploading.",
  invalid_upload: "That upload could not be read. Please try again.",
  unsupported_file_type: `Only ${VOLUNTEER_IMPORT_EXTENSIONS.join(" and ")} files can be imported.`,
  file_too_large: "That file is too large to import in one go. Split it up.",
  empty_file: "That file is empty.",
  unreadable_file:
    "That file could not be parsed. Re-export it and check for unclosed quotes.",
  missing_email_column: "The sheet needs an Email column — nothing was imported.",
  no_data_rows: "The sheet has a header but no rows.",
  too_many_rows: `One import carries at most ${VOLUNTEER_IMPORT_MAX_ROWS} rows. Split the sheet up.`,
  volunteer_import_failed: FALLBACK_ERROR,
  forbidden: "Your session no longer has admin access. Please sign in again.",
  unauthenticated: "Your session has expired. Please sign in again.",
};

const ACCEPT = VOLUNTEER_IMPORT_EXTENSIONS.join(",");

type UploadState = "idle" | "uploading";

/**
 * Bulk import zone (Spec v6 §5, Admin Dashboard). Upload a `.csv` or `.xlsx`
 * of volunteers: known addresses gain the sheet's skills, unknown ones become
 * new accounts and are welcomed.
 *
 * Rows are applied individually, so the response is a report rather than a
 * yes/no — a sheet with two bad rows still lands the good ones, and this panel
 * names the rows that did not so the admin can fix exactly those.
 */
export function VolunteerImportPanel() {
  const router = useRouter();
  const fieldId = useId();
  const [state, setState] = useState<UploadState>("idle");
  const [report, setReport] = useState<VolunteerImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "uploading") return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get(VOLUNTEER_IMPORT_FILE_FIELD);
    if (!(file instanceof File) || file.size === 0) {
      setReport(null);
      setError(UPLOAD_ERRORS.missing_file);
      return;
    }

    setState("uploading");
    setReport(null);
    setError(null);

    try {
      const response = await fetch(VOLUNTEER_IMPORT_ENDPOINT, {
        method: "POST",
        body: data,
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setError(UPLOAD_ERRORS[body?.error as string] ?? FALLBACK_ERROR);
        return;
      }

      setReport(body as VolunteerImportReport);
      form.reset();
      // New and merged members belong in the directory below straight away.
      router.refresh();
    } catch {
      setError(FALLBACK_ERROR);
    } finally {
      setState("idle");
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-ascend-taupe/30 p-4">
      <form onSubmit={upload} className="flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor={fieldId}
            className="block text-xs font-medium uppercase tracking-wide text-ascend-taupe"
          >
            Volunteer sheet
          </label>
          <input
            id={fieldId}
            name={VOLUNTEER_IMPORT_FILE_FIELD}
            type="file"
            accept={ACCEPT}
            required
            className="mt-1 w-80 max-w-full rounded-lg border border-ascend-taupe/40 bg-ascend-bg px-3 py-2 text-sm text-ascend-ink file:mr-3 file:rounded-md file:border-0 file:bg-ascend-surface file:px-3 file:py-1 file:text-sm file:text-ascend-navy focus:border-ascend-sky-deep focus:outline-none focus:ring-2 focus:ring-ascend-sky/60"
          />
        </div>
        <button
          type="submit"
          disabled={state === "uploading"}
          className="ascend-gradient rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60"
        >
          {state === "uploading" ? "Importing…" : "Import volunteers"}
        </button>
      </form>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-ascend-navy">
          Which columns does the sheet need?
        </summary>
        <dl className="mt-2 grid gap-2 sm:grid-cols-2">
          {VOLUNTEER_IMPORT_COLUMNS.map((column) => (
            <div key={column.field}>
              <dt className="text-sm font-medium text-ascend-navy">{column.header}</dt>
              <dd className="text-xs text-ascend-taupe">{column.description}</dd>
            </div>
          ))}
        </dl>
      </details>

      <div aria-live="polite">
        {error ? (
          <p role="alert" className="mt-4 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        {report ? <ImportReport report={report} /> : null}
      </div>
    </div>
  );
}

function ImportReport({ report }: { report: VolunteerImportReport }) {
  const { created, merged, unchanged, failed } = report.summary;
  const unwelcomed = report.results.filter(
    (result) => result.welcome === "failed",
  ).length;

  return (
    <div className="mt-4 border-t border-ascend-taupe/30 pt-4">
      <p className="text-sm text-ascend-ink">
        Read {countLabel(report.rows, "row")} from {report.filename}:{" "}
        <strong>{created}</strong> new {plural(created, "member")} welcomed,{" "}
        <strong>{merged}</strong> {plural(merged, "profile")} updated,{" "}
        <strong>{unchanged}</strong> already up to date, <strong>{failed}</strong>{" "}
        skipped.
      </p>

      {unwelcomed > 0 ? (
        <p role="alert" className="mt-2 text-sm text-red-800">
          {countLabel(unwelcomed, "new member")} could not be sent a welcome email.
          The {plural(unwelcomed, "account")} still exists — check the mail transport
          and invite them another way.
        </p>
      ) : null}

      {report.errors.length > 0 ? (
        <>
          <h4 className="mt-3 text-sm font-medium text-ascend-navy">
            Rows that were skipped
          </h4>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-red-800">
            {report.errors.map((rowError) => (
              <li key={`${rowError.row}-${rowError.code}`}>{rowError.message}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ascend-taupe">
            Nothing was changed for these rows. Fix them in the sheet and upload it
            again — rows that already landed will report as up to date.
          </p>
        </>
      ) : null}
    </div>
  );
}

function countLabel(count: number, noun: string): string {
  return `${count} ${plural(count, noun)}`;
}

function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}
