/** Repeatable query parameter used to narrow the board, e.g. `?skill=Meals`. */
export const BOARD_SKILL_PARAM = "skill";

/** Next hands a repeated query param back as `string[]`, a single one as `string`. */
export function readSkillParam(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}
