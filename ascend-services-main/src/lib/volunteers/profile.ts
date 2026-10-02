import { prisma } from "@/lib/prisma";

import { parseAppRole, type AppRole } from "@/lib/auth/roles";

/**
 * The volunteer facts the Help Wanted board and the assignment flow need:
 * which skills to filter the board by, and the name/bio a requester is
 * introduced to in the connection email (Spec v6 §4).
 */
export const VOLUNTEER_PROFILE_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  services_provided: true,
  bio: true,
} as const;

export interface VolunteerProfile {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  services_provided: string[];
  bio: string | null;
}

export interface VolunteerProfileRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  services_provided: string[];
  bio: string | null;
}

export function toVolunteerProfile(record: VolunteerProfileRecord): VolunteerProfile {
  return { ...record, role: parseAppRole(record.role) };
}

/**
 * Loads the signed-in member from the database rather than trusting the
 * session cookie: skills, bio and role can all change after a cookie is minted.
 */
export async function findVolunteerProfile(
  userId: string,
): Promise<VolunteerProfile | null> {
  const record = await prisma.user.findUnique({
    where: { id: userId },
    select: VOLUNTEER_PROFILE_SELECT,
  });

  return record ? toVolunteerProfile(record) : null;
}
