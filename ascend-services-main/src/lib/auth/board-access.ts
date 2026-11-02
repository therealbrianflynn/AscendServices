import { ADMIN_ROLE, SERVER_ROLE, type AppRole } from "./roles";

/** Who may open the Help Wanted board and claim a request. */
export function canOpenHelpBoard(viewer: {
  role: AppRole;
  validatedAt: Date | null;
}): boolean {
  if (viewer.role === ADMIN_ROLE) return true;
  return viewer.role === SERVER_ROLE && viewer.validatedAt !== null;
}
