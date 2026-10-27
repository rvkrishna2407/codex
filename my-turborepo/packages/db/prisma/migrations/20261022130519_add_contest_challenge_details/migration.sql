-- AlterTable
ALTER TABLE "Challenge" ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "starterCode" TEXT;

-- AlterTable
ALTER TABLE "Contest" ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "endTime" TIMESTAMP(3);
