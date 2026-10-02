/**
 * Catalogue of help categories offered by the public Request Help form.
 *
 * Configurable via `REQUEST_SERVICE_TYPES` (comma-separated) so a ministry can
 * adjust the list without a code change; the default below is the seed-MVP set.
 * Volunteer skill matching (Feature 2) reads the same catalogue.
 */
const DEFAULT_SERVICE_TYPES = [
  "Yard work",
  "Home repair",
  "Moving help",
  "Transportation",
  "Meals",
  "Errands or shopping",
  "Technology help",
  "Other",
] as const;

export function getServiceTypeOptions(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const configured = (env.REQUEST_SERVICE_TYPES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const options = configured.length > 0 ? configured : [...DEFAULT_SERVICE_TYPES];
  return [...new Set(options)];
}
