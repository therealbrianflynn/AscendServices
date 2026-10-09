-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'REQUESTER';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
