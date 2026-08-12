-- AlterEnum
ALTER TYPE "PaymentType" ADD VALUE 'settlement';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "settlementId" TEXT,
ALTER COLUMN "tripId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_settlementId_key" ON "Payment"("settlementId");

-- CreateIndex
CREATE INDEX "Payment_settlementId_idx" ON "Payment"("settlementId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

