-- AlterTable
ALTER TABLE "WarehouseOperation" ADD COLUMN     "evidence" JSONB,
ADD COLUMN     "putAwayAt" TIMESTAMP(3);
