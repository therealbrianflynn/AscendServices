-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "prayer_private" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "prayer_request" TEXT;

-- CreateIndex
CREATE INDEX "Request_status_idx" ON "Request"("status");
