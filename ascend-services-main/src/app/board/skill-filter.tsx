import Link from "next/link";

import { BOARD_SKILL_PARAM } from "./board-params";

const chipClass =
  "rounded-full px-3 py-1 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ascend-sky/60";
const activeChipClass = "bg-ascend-navy text-white";
const idleChipClass =
  "bg-ascend-bg text-ascend-navy ring-1 ring-ascend-taupe/40 hover:ring-ascend-sky-deep";

/**
 * Skill chips for the Help Wanted board. Plain links, so filtering works
 * without JavaScript and every view of the board is a shareable URL.
 */
export function SkillFilter({
  available,
  selected,
}: {
  available: string[];
  selected: string[];
}) {
  if (available.length === 0) {
    return (
      <p className="mt-4 text-sm text-ascend-taupe">
        No skills on your profile yet, so the board shows every open request.
      </p>
    );
  }

  return (
    <nav aria-label="Filter by skill" className="mt-4 flex flex-wrap gap-2">
      <Link
        href="/board"
        aria-current={selected.length === 0 ? "true" : undefined}
        className={`${chipClass} ${selected.length === 0 ? activeChipClass : idleChipClass}`}
      >
        All my skills
      </Link>
      {available.map((skill) => {
        const active = selected.includes(skill);
        return (
          <Link
            key={skill}
            href={boardHref(toggle(selected, skill))}
            aria-current={active ? "true" : undefined}
            className={`${chipClass} ${active ? activeChipClass : idleChipClass}`}
          >
            {skill}
          </Link>
        );
      })}
    </nav>
  );
}

function toggle(selected: string[], skill: string): string[] {
  return selected.includes(skill)
    ? selected.filter((value) => value !== skill)
    : [...selected, skill];
}

function boardHref(skills: string[]): string {
  if (skills.length === 0) return "/board";
  const params = new URLSearchParams();
  for (const skill of skills) params.append(BOARD_SKILL_PARAM, skill);
  return `/board?${params.toString()}`;
}
