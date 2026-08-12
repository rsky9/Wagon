-- CreateTable
CREATE TABLE "Facility" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "operatorId" TEXT,
    "address" TEXT,
    "city" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "capacitySlots" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseOperation" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "shipmentId" TEXT,
    "ref" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'appointment',
    "appointmentAt" TIMESTAMP(3),
    "gateInAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "storedAt" TIMESTAMP(3),
    "pickedAt" TIMESTAMP(3),
    "stagedAt" TIMESTAMP(3),
    "loadedAt" TIMESTAMP(3),
    "gateOutAt" TIMESTAMP(3),
    "operatorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Facility_kind_idx" ON "Facility"("kind");

-- CreateIndex
CREATE INDEX "WarehouseOperation_facilityId_idx" ON "WarehouseOperation"("facilityId");

-- CreateIndex
CREATE INDEX "WarehouseOperation_shipmentId_idx" ON "WarehouseOperation"("shipmentId");

-- AddForeignKey
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseOperation" ADD CONSTRAINT "WarehouseOperation_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseOperation" ADD CONSTRAINT "WarehouseOperation_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseOperation" ADD CONSTRAINT "WarehouseOperation_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
