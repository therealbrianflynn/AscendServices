/**
 * Bootstraps exactly one ADMIN user. Idempotent: re-running promotes/keeps the
 * same address as ADMIN rather than creating duplicates.
 *
 *   ADMIN_SEED_EMAIL=you@example.com pnpm db:seed:admin
 *
 * The address is supplied by the environment (see `.env.example`) — nothing is
 * hardcoded, and no password exists to leak: sign in via the magic link.
 */
import { displayNameFor, normalizeEmail } from "../src/lib/auth/email-address";
import { ADMIN_ROLE } from "../src/lib/auth/roles";
import { log } from "../src/lib/logger";
import { prisma } from "../src/lib/prisma";

async function main(): Promise<void> {
  const rawEmail = process.env.ADMIN_SEED_EMAIL;
  if (!rawEmail || rawEmail.trim().length === 0) {
    throw new Error(
      "ADMIN_SEED_EMAIL is required (see .env.example), e.g. ADMIN_SEED_EMAIL=you@example.com pnpm db:seed:admin",
    );
  }

  const email = normalizeEmail(rawEmail);
  const name = displayNameFor(process.env.ADMIN_SEED_NAME, email);

  const admin = await prisma.user.upsert({
    where: { email },
    update: { role: ADMIN_ROLE },
    create: { email, name, role: ADMIN_ROLE },
    select: { id: true, email: true, role: true },
  });

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "ADMIN_SEEDED",
      metadata: { source: "scripts/seed-admin.ts" },
    },
  });

  log({
    msg: "admin_seeded",
    action: "ADMIN_SEEDED",
    actorId: admin.id,
    email: admin.email,
    role: admin.role,
  });
}

main()
  .catch((err: unknown) => {
    log({
      level: "error",
      msg: "admin_seed_failed",
      error: err instanceof Error ? err.message : "unknown",
    });
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
