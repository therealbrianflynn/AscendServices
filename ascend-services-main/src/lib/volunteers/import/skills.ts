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

/**
 * Care-team exports write several areas in one cell with spaces, not commas.
 * Longer phrases are matched first so "car mechanic" is not left as two words.
 * "Car mechanic" is stored as Auto Mechanic, the catalogue name for that help.
 */
const SERVICE_PHRASES = [
  { phrase: "adopt a military family", label: "Adopt a Military Family" },
  { phrase: "car mechanic", label: "Auto Mechanic" },
  { phrase: "auto mechanic", label: "Auto Mechanic" },
  { phrase: "handyman", label: "Handyman" },
  { phrase: "counseling", label: "Counseling" },
] as const;

/** Splits one cell into trimmed skills, dropping blanks and repeats. */
export function splitSkills(raw: string): string[] {
  const pieces = raw.split(SKILL_SEPARATORS).map((skill) => skill.trim());
  return dedupe(pieces.flatMap(recognizeSkill));
}

function recognizeSkill(piece: string): string[] {
  if (piece.length === 0) return [];

  const labels: string[] = [];
  let rest = piece.toLowerCase().replace(/\s+/g, " ").trim();

  while (rest.length > 0) {
    const match = earliestPhrase(rest);
    if (!match || match.index !== 0) return [piece];
    labels.push(match.label);
    rest = rest.slice(match.phrase.length).trim();
  }

  return labels.length > 0 ? labels : [piece];
}

function earliestPhrase(text: string): { phrase: string; label: string; index: number } | null {
  let best: { phrase: string; label: string; index: number } | null = null;

  for (const entry of SERVICE_PHRASES) {
    const index = text.indexOf(entry.phrase);
    if (index === -1) continue;
    const end = index + entry.phrase.length;
    const startsClean = index === 0 || text[index - 1] === " ";
    const endsClean = end === text.length || text[end] === " ";
    if (!startsClean || !endsClean) continue;
    if (
      !best ||
      index < best.index ||
      (index === best.index && entry.phrase.length > best.phrase.length)
    ) {
      best = { phrase: entry.phrase, label: entry.label, index };
    }
  }

  return best;
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
