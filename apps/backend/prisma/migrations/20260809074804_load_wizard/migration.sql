-- AlterTable
ALTER TABLE "Load" ADD COLUMN     "advanceAmount" DOUBLE PRECISION,
ADD COLUMN     "bodyType" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "documents" TEXT[],
ADD COLUMN     "dropDate" TIMESTAMP(3),
ADD COLUMN     "loadingReq" TEXT,
ADD COLUMN     "pickupDate" TIMESTAMP(3),
ADD COLUMN     "specialReq" TEXT,
ADD COLUMN     "unloadingReq" TEXT;
