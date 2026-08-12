-- CreateTable
CREATE TABLE "ForwardOrder" (
    "id" TEXT NOT NULL,
    "forwarderId" TEXT NOT NULL,
    "customerId" TEXT,
    "shipmentId" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'intake',
    "buyAmount" DOUBLE PRECISION,
    "sellAmount" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForwardOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarrierBooking" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "legId" TEXT,
    "carrierId" TEXT,
    "bookingRef" TEXT,
    "vessel" TEXT,
    "voyage" TEXT,
    "flight" TEXT,
    "equipment" TEXT,
    "rate" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'requested',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarrierBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForwardDocument" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "number" TEXT,
    "issuerId" TEXT,
    "storageKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForwardDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ForwardOrder_shipmentId_key" ON "ForwardOrder"("shipmentId");

-- CreateIndex
CREATE INDEX "ForwardOrder_forwarderId_idx" ON "ForwardOrder"("forwarderId");

-- CreateIndex
CREATE INDEX "CarrierBooking_shipmentId_idx" ON "CarrierBooking"("shipmentId");

-- CreateIndex
CREATE INDEX "ForwardDocument_shipmentId_idx" ON "ForwardDocument"("shipmentId");

-- AddForeignKey
ALTER TABLE "ForwardOrder" ADD CONSTRAINT "ForwardOrder_forwarderId_fkey" FOREIGN KEY ("forwarderId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForwardOrder" ADD CONSTRAINT "ForwardOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForwardOrder" ADD CONSTRAINT "ForwardOrder_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierBooking" ADD CONSTRAINT "CarrierBooking_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierBooking" ADD CONSTRAINT "CarrierBooking_legId_fkey" FOREIGN KEY ("legId") REFERENCES "ShipmentLeg"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierBooking" ADD CONSTRAINT "CarrierBooking_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForwardDocument" ADD CONSTRAINT "ForwardDocument_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForwardDocument" ADD CONSTRAINT "ForwardDocument_issuerId_fkey" FOREIGN KEY ("issuerId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
