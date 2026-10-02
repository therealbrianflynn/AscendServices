-- Spec v6 alignment: RequestStatus enum values and SystemSettings SLA threshold units.

-- Preserve the fact that legacy terminal states were folded into COMPLETE.
INSERT INTO "AuditLog" ("id", "createdAt", "requestId", "action", "fromStatus", "toStatus", "metadata")
SELECT gen_random_uuid()::text,
       NOW(),
       "id",
       'REQUEST_STATUS_CHANGED',
       "status"::text,
       'COMPLETE',
       jsonb_build_object('reason', 'spec-v6-status-enum-alignment')
FROM "Request"
WHERE "status"::text IN ('COMPLETED', 'CANCELLED');

-- AlterEnum
BEGIN;
CREATE TYPE "RequestStatus_new" AS ENUM ('NEW', 'ASSIGNED', 'CONTACT_MADE', 'IN_PROGRESS', 'COMPLETE');
ALTER TABLE "public"."Request" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Request" ALTER COLUMN "status" TYPE "RequestStatus_new" USING (
  CASE "status"::text
    WHEN 'COMPLETED' THEN 'COMPLETE'
    WHEN 'CANCELLED' THEN 'COMPLETE'
    ELSE "status"::text
  END
)::"RequestStatus_new";
ALTER TYPE "RequestStatus" RENAME TO "RequestStatus_old";
ALTER TYPE "RequestStatus_new" RENAME TO "RequestStatus";
DROP TYPE "public"."RequestStatus_old";
ALTER TABLE "Request" ALTER COLUMN "status" SET DEFAULT 'NEW';
COMMIT;

-- AlterTable
ALTER TABLE "SystemSettings" ADD COLUMN     "stalled_contact_alert_hours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "stalled_progress_days" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "unassigned_alert_hours" INTEGER NOT NULL DEFAULT 24;

-- Carry configured thresholds across the minutes -> hours/days unit change.
UPDATE "SystemSettings"
SET "unassigned_alert_hours"      = GREATEST(1, ROUND("unassigned_sla_minutes" / 60.0))::int,
    "stalled_contact_alert_hours" = GREATEST(1, ROUND("stalled_assignment_sla_minutes" / 60.0))::int,
    "stalled_progress_days"       = GREATEST(1, ROUND("stalled_progress_sla_minutes" / 1440.0))::int;

ALTER TABLE "SystemSettings" DROP COLUMN "stalled_assignment_sla_minutes",
DROP COLUMN "stalled_progress_sla_minutes",
DROP COLUMN "unassigned_sla_minutes";
