/**
 * Upload contract for the Spec v6 §4 bulk volunteer import: the endpoint, its
 * limits, and the columns a sheet may carry.
 *
 * Described once, here, and deliberately dependency-free so the browser can
 * import it: the parser maps headers with it, the admin console renders the
 * "expected columns" help and the file picker from it, and the sample sheets in
 * `src/__fixtures__/volunteer-import/` are written against it. A ministry
 * exporting a spreadsheet from elsewhere should not have to guess our spelling,
 * so each column accepts the aliases people actually use.
 */

export const VOLUNTEER_IMPORT_ENDPOINT = "/api/admin/users/import";

/** Multipart field the admin console posts the sheet under. */
export const VOLUNTEER_IMPORT_FILE_FIELD = "file";

export const VOLUNTEER_IMPORT_EXTENSIONS = [".csv", ".xlsx"] as const;

/** One upload is a working batch, not a migration; keeps a bad paste bounded. */
export const VOLUNTEER_IMPORT_MAX_ROWS = 500;

/** Comfortably above `VOLUNTEER_IMPORT_MAX_ROWS` of real rows, well below a DoS. */
export const VOLUNTEER_IMPORT_MAX_BYTES = 2 * 1024 * 1024;

export type VolunteerImportField = "email" | "name" | "services_provided" | "bio";

export interface VolunteerImportColumn {
  field: VolunteerImportField;
  /** Header used by the sample sheets. */
  header: string;
  /** Accepted header spellings, already normalised by `normalizeHeader`. */
  aliases: string[];
  required: boolean;
  /** Admin-facing explanation of what the column does to a profile. */
  description: string;
}

export const VOLUNTEER_IMPORT_COLUMNS: readonly VolunteerImportColumn[] = [
  {
    field: "email",
    header: "Email",
    aliases: ["email", "e mail", "email address", "e mail address"],
    required: true,
    description: "Required. The account is matched — and merged — on this address.",
  },
  {
    field: "name",
    header: "Name",
    aliases: ["name", "full name", "volunteer", "volunteer name"],
    required: false,
    description:
      "Used for a new account; a blank cell leaves an existing name untouched.",
  },
  {
    field: "services_provided",
    header: "Skills",
    aliases: ["skills", "skill", "services", "services provided", "services offered"],
    required: false,
    description:
      "Comma or semicolon separated. Added to the skills already on the profile; nothing is removed.",
  },
  {
    field: "bio",
    header: "Bio",
    aliases: ["bio", "about", "introduction"],
    required: false,
    description:
      "Short introduction shown to a requester; a blank cell leaves an existing bio untouched.",
  },
];

/**
 * Header matching is deliberately forgiving: "E-Mail", "email_address" and
 * "Email Address" are the same column to everyone except a strict parser.
 */
export function normalizeHeader(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ");
}

/** The field a sheet's header maps to, or `null` for a column we ignore. */
export function fieldForHeader(raw: string): VolunteerImportField | null {
  const normalized = normalizeHeader(raw);
  const column = VOLUNTEER_IMPORT_COLUMNS.find(
    (candidate) =>
      candidate.aliases.includes(normalized) ||
      normalizeHeader(candidate.field) === normalized,
  );
  return column?.field ?? null;
}
