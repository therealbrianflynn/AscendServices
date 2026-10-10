-- AlterTable
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "Request" ADD COLUMN "requester_phone" TEXT;

-- Care-team import stored a bare number as the whole bio ("Phone: 3175550100").
UPDATE "User"
SET
  "phone" = btrim(substring(bio from 8)),
  bio = NULL
WHERE bio ~ '^Phone: [0-9+(). -]+$'
  AND "phone" IS NULL;
