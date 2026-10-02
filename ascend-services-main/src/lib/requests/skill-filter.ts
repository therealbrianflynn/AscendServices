/**
 * Skill matching for the Help Wanted board (Spec v6 §5: "NEW requests,
 * filtered by the user's specific skills").
 *
 * Pure so the rule can be reasoned about — and tested — without a database.
 */

export interface BoardSkillFilterInput {
  /** `User.services_provided` — the skills the volunteer signed up to offer. */
  providedSkills: readonly string[];
  /** Skills ticked on the board, e.g. `?skill=Meals&skill=Yard+work`. */
  requestedSkills?: readonly string[];
}

export interface BoardSkillFilter {
  /**
   * Service types the board query must match, or `null` for "no restriction".
   * A volunteer with no skills on file sees every open request instead of an
   * empty board — an unfinished profile must not read as "nothing to do".
   */
  serviceTypes: string[] | null;
  /** The skills the board is actually matching on right now. */
  applied: string[];
  /** Skills the volunteer can narrow by, deduplicated and in profile order. */
  available: string[];
  /**
   * The honoured subset of `requestedSkills`. Empty means "no explicit
   * narrowing" — which the board renders as every skill on the profile.
   */
  requested: string[];
}

export function resolveBoardSkillFilter({
  providedSkills,
  requestedSkills = [],
}: BoardSkillFilterInput): BoardSkillFilter {
  const available = dedupe(providedSkills);
  const requested = dedupe(requestedSkills);

  if (available.length === 0) {
    // No profile skills to narrow against; an ad-hoc `?skill=` still filters.
    return {
      serviceTypes: requested.length > 0 ? requested : null,
      applied: requested,
      available,
      requested,
    };
  }

  // A volunteer may narrow their own board, never widen it past their skills.
  // Unrecognised `?skill=` values are dropped rather than emptying the board.
  const narrowed = available.filter((skill) => includesIgnoringCase(requested, skill));
  const applied = narrowed.length > 0 ? narrowed : available;

  return { serviceTypes: applied, applied, available, requested: narrowed };
}

function dedupe(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed.length === 0) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }

  return unique;
}

function includesIgnoringCase(values: readonly string[], candidate: string): boolean {
  const needle = candidate.toLowerCase();
  return values.some((value) => value.toLowerCase() === needle);
}
