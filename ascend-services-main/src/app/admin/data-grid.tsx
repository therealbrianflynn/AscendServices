"use client";

import { useTable } from "@tanstack/react-table";
import { useId } from "react";

import {
  ADMIN_GRID_FEATURES,
  type AdminGridColumns,
  type AdminGridRow,
} from "./admin-grid";

/** Ascending / descending markers for the sortable column headers. */
const SORT_MARKER = { asc: "▲", desc: "▼" } as const;

const cellClass = "px-3 py-2 align-top text-ascend-ink";
const headerClass =
  "border-b border-ascend-taupe/40 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ascend-taupe";

export interface DataGridProps<TData extends AdminGridRow> {
  columns: AdminGridColumns<TData>;
  data: TData[];
  /** Table caption — the accessible name of the grid. */
  caption: string;
  searchLabel: string;
  emptyMessage: string;
  /** When set, the grid is the master list: choosing a row opens that record. */
  selectedId?: string | null;
  onSelect?: (row: TData) => void;
}

/**
 * The one grid the admin console renders. Both the request pipeline and the
 * member directory share sort and search. A screen that edits a record can
 * also treat the grid as the master list and open the chosen row beside it.
 */
export function DataGrid<TData extends AdminGridRow>({
  columns,
  data,
  caption,
  searchLabel,
  emptyMessage,
  selectedId = null,
  onSelect,
}: DataGridProps<TData>) {
  const searchId = useId();

  const table = useTable({
    features: ADMIN_GRID_FEATURES,
    columns,
    data,
    getRowId: (row) => row.id,
    globalFilterFn: "includesString",
  });

  const rows = table.getRowModel().rows;
  const search = table.state.globalFilter ?? "";

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label
            htmlFor={searchId}
            className="block text-xs font-medium uppercase tracking-wide text-ascend-taupe"
          >
            {searchLabel}
          </label>
          <input
            id={searchId}
            type="search"
            value={search}
            onChange={(event) => table.setGlobalFilter(event.target.value)}
            className="mt-1 w-72 rounded-lg border border-ascend-taupe/40 bg-ascend-bg px-3 py-2 text-sm text-ascend-ink focus:border-ascend-sky-deep focus:outline-none focus:ring-2 focus:ring-ascend-sky/60"
          />
        </div>
        <p aria-live="polite" className="text-sm text-ascend-taupe">
          Showing {rows.length} of {data.length}
        </p>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-ascend-taupe/30">
        <table className="min-w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-ascend-surface">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        sorted === "asc"
                          ? "ascending"
                          : sorted === "desc"
                            ? "descending"
                            : undefined
                      }
                      className={headerClass}
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="flex items-center gap-1 uppercase hover:text-ascend-sky-deep"
                        >
                          <table.FlexRender header={header} />
                          <span aria-hidden="true">
                            {sorted ? SORT_MARKER[sorted] : ""}
                          </span>
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => {
              const selected = selectedId === row.id;
              return (
                <tr
                  key={row.id}
                  className={
                    selected
                      ? "border-t border-ascend-taupe/20 bg-ascend-sun/70 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ascend-sky-deep"
                      : onSelect
                        ? "cursor-pointer border-t border-ascend-taupe/20 outline-none hover:bg-ascend-sky/10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ascend-sky-deep"
                        : "border-t border-ascend-taupe/20"
                  }
                  aria-selected={onSelect ? selected : undefined}
                  tabIndex={onSelect ? 0 : undefined}
                  onClick={onSelect ? () => onSelect(row.original) : undefined}
                  onKeyDown={
                    onSelect
                      ? (event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          onSelect(row.original);
                        }
                      : undefined
                  }
                >
                  {row.getAllCells().map((cell) => (
                    <td key={cell.id} className={onSelect ? `${cellClass} cursor-pointer` : cellClass}>
                      <table.FlexRender cell={cell} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ascend-taupe">
          {data.length > 0 && search.length > 0 ? "Nothing matches that search." : emptyMessage}
        </p>
      ) : null}
    </div>
  );
}
