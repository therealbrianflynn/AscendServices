/**
 * Skill list handling for the volunteer import (Spec v6 §4: "If an email
 * exists, the system appends new skills to the user's profile").
 *
 * Every operation here is additive. An import sheet is one admin's snapshot of
 * what a volunteer offers, never the whole truth about them, so it may add to
 * `services_provided` and must never take away.
 */

/** A cell may list several skills; ministries use commas, semicolons or pipes. */
const SKILL_SEPARATORS = /[,;|]/;

/** Splits one cell into trimmed skills, dropping blanks and repeats. */
export function splitSkills(raw: string): string[] {
  return dedupe(raw.split(SKILL_SEPARATORS).map((skill) => skill.trim()));
}

/**
 * Union of what the profile already lists and what the sheet adds. Existing
 * entries keep their position and their spelling: a sheet that writes
 * "yard work" must not silently re-case a skill the volunteer chose.
 */
export function mergeSkills(existing: string[], incoming: string[]): string[] {
  return dedupe([...existing, ...incoming]);
}

/** The entries `incoming` contributes that `existing` did not already cover. */
export function addedSkills(existing: string[], incoming: string[]): string[] {
  const known = new Set(existing.map(comparisonKey));
  return dedupe(incoming).filter((skill) => !known.has(comparisonKey(skill)));
}

function dedupe(skills: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const skill of skills) {
    const trimmed = skill.trim();
    const key = comparisonKey(trimmed);
    if (trimmed.length === 0 || seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }

  return unique;
}

/** "Yard work" and "yard work" are one skill, not two. */
function comparisonKey(skill: string): string {
  return skill.toLowerCase();
}
