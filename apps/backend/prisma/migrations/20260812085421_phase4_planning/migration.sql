-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "activePlanId" TEXT;

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "legs" JSONB NOT NULL,
    "cost" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "etaHours" DOUBLE PRECISION,
    "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "selectedBy" TEXT,
    "selectedAt" TIMESTAMP(3),
    "failedLegIndex" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Plan_shipmentId_idx" ON "Plan"("shipmentId");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_activePlanId_fkey" FOREIGN KEY ("activePlanId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
