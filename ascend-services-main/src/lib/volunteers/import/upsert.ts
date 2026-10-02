import { displayNameFor } from "@/lib/auth/email-address";
import { SERVER_ROLE } from "@/lib/auth/roles";
import { createOnboardingToken } from "@/lib/auth/tokens";
import { prisma } from "@/lib/prisma";

import type { VolunteerImportRow } from "./rows";
import { addedSkills, mergeSkills } from "./skills";
import { sendVolunteerWelcome, type VolunteerWelcomeOutcome } from "./welcome";

export const VOLUNTEER_IMPORTED_ACTION = "VOLUNTEER_IMPORTED";

/** Audit metadata marker: this account change came from a spreadsheet. */
const VOLUNTEER_IMPORT_SOURCE = "volunteer_import";

/**
 * What the upsert needs to decide whether a row changes anything.
 * `onboarding_token` is absent on purpose: the import must never read an
 * existing invite credential, let alone copy it into a report.
 */
const IMPORT_TARGET_SELECT = {
  id: true,
  name: true,
  email: true,
  services_provided: true,
  bio: true,
} as const;

export type VolunteerUpsertOutcome = "created" | "merged" | "unchanged";

export interface VolunteerUpsertResult {
  row: number;
  email: string;
  name: string;
  userId: string;
  outcome: VolunteerUpsertOutcome;
  /** Skills this row contributed; empty when the profile already had them all. */
  added_skills: string[];
  /** Only a newly created account is welcomed. */
  welcome?: VolunteerWelcomeOutcome;
}

interface ImportTarget {
  id: string;
  name: string;
  email: string;
  services_provided: string[];
  bio: string | null;
}

/**
 * Applies one sheet row (Spec v6 §4). An existing address is merged into; an
 * unknown one becomes a SERVER account with an `onboarding_token` and a welcome
 * message. `role` is never taken from a spreadsheet — ADMIN stays a deliberate
 * act (`pnpm db:seed:admin`), not an import side effect.
 */
export async function upsertVolunteer(
  row: VolunteerImportRow,
  actorId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<VolunteerUpsertResult> {
  const existing = (await prisma.user.findUnique({
    where: { email: row.email },
    select: IMPORT_TARGET_SELECT,
  })) as ImportTarget | null;

  return existing
    ? mergeVolunteer(row, existing, actorId)
    : createVolunteer(row, actorId, env);
}

/**
 * The account row and its audit entry share one transaction, so a failed import
 * row leaves nothing behind. The welcome is sent afterwards: mailing someone
 * about an account a rollback just removed would be worse than not mailing.
 */
async function createVolunteer(
  row: VolunteerImportRow,
  actorId: string,
  env: NodeJS.ProcessEnv,
): Promise<VolunteerUpsertResult> {
  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: row.email,
        name: displayNameFor(row.name, row.email),
        role: SERVER_ROLE,
        services_provided: row.services_provided,
        bio: row.bio,
        onboarding_token: createOnboardingToken(),
      },
      select: { id: true, name: true, email: true },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: VOLUNTEER_IMPORTED_ACTION,
        metadata: {
          source: VOLUNTEER_IMPORT_SOURCE,
          userId: user.id,
          outcome: "created",
          row: row.row,
          added_skills: row.services_provided,
        },
      },
    });

    return user as { id: string; name: string; email: string };
  });

  return {
    row: row.row,
    email: created.email,
    name: created.name,
    userId: created.id,
    outcome: "created",
    added_skills: row.services_provided,
    welcome: await sendVolunteerWelcome(created, env),
  };
}

/**
 * Additive by construction: skills are unioned, and a blank cell leaves the
 * column it maps to alone. An import sheet is one admin's snapshot of a
 * volunteer, so it may fill gaps and add skills but never clear a profile.
 */
async function mergeVolunteer(
  row: VolunteerImportRow,
  existing: ImportTarget,
  actorId: string,
): Promise<VolunteerUpsertResult> {
  const added = addedSkills(existing.services_provided, row.services_provided);
  const name = row.name !== null && row.name !== existing.name ? row.name : null;
  const bio = row.bio !== null && row.bio !== existing.bio ? row.bio : null;
  const changed = [
    ...(added.length > 0 ? ["services_provided"] : []),
    ...(name !== null ? ["name"] : []),
    ...(bio !== null ? ["bio"] : []),
  ];

  if (changed.length === 0) {
    return {
      row: row.row,
      email: existing.email,
      name: existing.name,
      userId: existing.id,
      outcome: "unchanged",
      added_skills: [],
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: existing.id },
      data: {
        ...(added.length > 0
          ? { services_provided: mergeSkills(existing.services_provided, added) }
          : {}),
        ...(name !== null ? { name } : {}),
        ...(bio !== null ? { bio } : {}),
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: VOLUNTEER_IMPORTED_ACTION,
        metadata: {
          source: VOLUNTEER_IMPORT_SOURCE,
          userId: existing.id,
          outcome: "merged",
          row: row.row,
          changed,
          added_skills: added,
        },
      },
    });
  });

  return {
    row: row.row,
    email: existing.email,
    name: name ?? existing.name,
    userId: existing.id,
    outcome: "merged",
    added_skills: added,
  };
}
