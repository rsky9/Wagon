-- AlterTable
ALTER TABLE "CountryPack" ADD COLUMN     "baseCurrency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "exchangeRateToBase" DOUBLE PRECISION DEFAULT 1;

-- AlterTable
ALTER TABLE "ForwardOrder" ADD COLUMN     "consolidationId" TEXT;

-- AlterTable
ALTER TABLE "LogisticsEvent" ADD COLUMN     "orgId" TEXT;

-- AlterTable
ALTER TABLE "OutboxMessage" ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "nextRetryAt" TIMESTAMP(3),
ADD COLUMN     "orgId" TEXT;

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "ownerOrgId" TEXT;

-- AlterTable
ALTER TABLE "WebhookDelivery" ADD COLUMN     "dedupeKey" TEXT;

-- CreateTable
CREATE TABLE "Consolidation" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "forwarderId" TEXT NOT NULL,
    "shipmentId" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'ocean',
    "origin" TEXT,
    "destination" TEXT,
    "equipment" TEXT,
    "cargoWeightKg" DOUBLE PRECISION,
    "cargoVolumeM3" DOUBLE PRECISION,
    "cargoPieces" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'grouping',
    "bookedCarrierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consolidation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Consolidation_forwarderId_idx" ON "Consolidation"("forwarderId");

-- CreateIndex
CREATE INDEX "Consolidation_status_idx" ON "Consolidation"("status");

-- CreateIndex
CREATE INDEX "LogisticsEvent_orgId_idx" ON "LogisticsEvent"("orgId");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_claimedAt_idx" ON "OutboxMessage"("status", "claimedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxMessage_dedupeKey_key" ON "OutboxMessage"("dedupeKey");

-- CreateIndex
CREATE INDEX "Shipment_ownerOrgId_idx" ON "Shipment"("ownerOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_ref_key" ON "Shipment"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentLeg_shipmentId_sequence_key" ON "ShipmentLeg"("shipmentId", "sequence");

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_nextRetryAt_idx" ON "WebhookDelivery"("status", "nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookDelivery_dedupeKey_key" ON "WebhookDelivery"("dedupeKey");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_ownerOrgId_fkey" FOREIGN KEY ("ownerOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsEvent" ADD CONSTRAINT "LogisticsEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForwardOrder" ADD CONSTRAINT "ForwardOrder_consolidationId_fkey" FOREIGN KEY ("consolidationId") REFERENCES "Consolidation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consolidation" ADD CONSTRAINT "Consolidation_forwarderId_fkey" FOREIGN KEY ("forwarderId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consolidation" ADD CONSTRAINT "Consolidation_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consolidation" ADD CONSTRAINT "Consolidation_bookedCarrierId_fkey" FOREIGN KEY ("bookedCarrierId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

