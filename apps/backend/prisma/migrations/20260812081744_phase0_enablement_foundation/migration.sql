-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('draft', 'planned', 'quoted', 'booked', 'in_transit', 'delivered', 'closed', 'cancelled');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "gst" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "originId" TEXT,
    "destinationId" TEXT,
    "commodity" TEXT,
    "description" TEXT,
    "weightKg" DOUBLE PRECISION,
    "volumeM3" DOUBLE PRECISION,
    "pieces" INTEGER,
    "pickupWindow" TIMESTAMP(3),
    "deliveryWindow" TIMESTAMP(3),
    "value" DOUBLE PRECISION,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'draft',
    "mode" TEXT NOT NULL DEFAULT 'road',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentLeg" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "originId" TEXT,
    "destinationId" TEXT,
    "pickupAddr" TEXT,
    "dropAddr" TEXT,
    "distanceKm" DOUBLE PRECISION,
    "equipment" TEXT,
    "providerId" TEXT,
    "bookedAt" TIMESTAMP(3),
    "departedAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'planned',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipmentLeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogisticsEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventCode" TEXT NOT NULL,
    "classifier" TEXT NOT NULL DEFAULT 'ACT',
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "shipmentId" TEXT,
    "legId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "location" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "evidence" TEXT,
    "correlationId" TEXT,
    "payload" JSONB,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "LogisticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxMessage" (
    "id" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Organization_kind_idx" ON "Organization"("kind");

-- CreateIndex
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");

-- CreateIndex
CREATE INDEX "ShipmentLeg_shipmentId_idx" ON "ShipmentLeg"("shipmentId");

-- CreateIndex
CREATE INDEX "LogisticsEvent_shipmentId_idx" ON "LogisticsEvent"("shipmentId");

-- CreateIndex
CREATE INDEX "LogisticsEvent_entityType_entityId_idx" ON "LogisticsEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "LogisticsEvent_eventType_eventCode_idx" ON "LogisticsEvent"("eventType", "eventCode");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_createdAt_idx" ON "OutboxMessage"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_originId_fkey" FOREIGN KEY ("originId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLeg" ADD CONSTRAINT "ShipmentLeg_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLeg" ADD CONSTRAINT "ShipmentLeg_originId_fkey" FOREIGN KEY ("originId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLeg" ADD CONSTRAINT "ShipmentLeg_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLeg" ADD CONSTRAINT "ShipmentLeg_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsEvent" ADD CONSTRAINT "LogisticsEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsEvent" ADD CONSTRAINT "LogisticsEvent_legId_fkey" FOREIGN KEY ("legId") REFERENCES "ShipmentLeg"("id") ON DELETE SET NULL ON UPDATE CASCADE;
