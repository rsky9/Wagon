-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "payRate" DOUBLE PRECISION;

-- CreateIndex
CREATE UNIQUE INDEX "Trip_loadId_key" ON "Trip"("loadId");

