-- AlterTable
ALTER TABLE "Load" ADD COLUMN     "ewbCancelledAt" TIMESTAMP(3),
ADD COLUMN     "ewbDocKey" TEXT,
ADD COLUMN     "ewbGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "ewbStatus" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "ewbValidUntil" TIMESTAMP(3);

