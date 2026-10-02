"use client";

import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  type ColumnHelper,
} from "@tanstack/react-table";

/**
 * Shared TanStack Table setup for the admin console grids. Registered once so
 * both grids agree on what a grid can do — sort a column and search every cell —
 * and so v9 only bundles the features we actually use.
 */
export const ADMIN_GRID_FEATURES = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
});

export type AdminGridFeatures = typeof ADMIN_GRID_FEATURES;

/** Every admin row is a database row, so its id is the stable React key. */
export interface AdminGridRow {
  id: string;
}

export type AdminGridColumns<TData extends AdminGridRow> = ReturnType<
  ColumnHelper<AdminGridFeatures, TData>["columns"]
>;

export function createAdminColumnHelper<TData extends AdminGridRow>() {
  return createColumnHelper<AdminGridFeatures, TData>();
}

/**
 * Fixed locale and time zone: a grid cell is rendered on the server and then
 * hydrated on the client, and "whatever locale each end happens to have" is a
 * hydration mismatch waiting to happen.
 */
const DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export function formatDay(iso: string | null): string {
  return iso ? DAY_FORMAT.format(new Date(iso)) : "—";
}
