-- CreateTable
CREATE TABLE "RequestQuestion" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RequestQuestion_requestId_createdAt_idx" ON "RequestQuestion"("requestId", "createdAt");

-- AddForeignKey
ALTER TABLE "RequestQuestion" ADD CONSTRAINT "RequestQuestion_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
