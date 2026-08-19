-- AlterTable
ALTER TABLE "CarrierBooking" ADD COLUMN     "containerId" TEXT;

-- AlterTable
ALTER TABLE "Settlement" ADD COLUMN     "invoiceId" TEXT;

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "partyAOrgId" TEXT NOT NULL,
    "partyBOrgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rateCardId" TEXT,
    "slaJson" JSONB,
    "territoryJson" JSONB,
    "liabilityJson" JSONB,
    "incoterms" TEXT,
    "paymentTerms" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "effectiveAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "signedByA" TEXT,
    "signedByB" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'freight',
    "tripId" TEXT,
    "shipmentId" TEXT,
    "billFromOrgId" TEXT,
    "billToOrgId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "baseAmount" DOUBLE PRECISION,
    "gstAmount" DOUBLE PRECISION,
    "tdsAmount" DOUBLE PRECISION,
    "netAmount" DOUBLE PRECISION,
    "paidAmount" DOUBLE PRECISION DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "issueDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "disputeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT,
    "qty" DOUBLE PRECISION,
    "rate" DOUBLE PRECISION,
    "amount" DOUBLE PRECISION,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Container" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT '20GP',
    "ownerOrgId" TEXT,
    "operatorOrgId" TEXT,
    "cargoUnitId" TEXT,
    "currentFacilityId" TEXT,
    "locationRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'available',
    "sealNo" TEXT,
    "bookingId" TEXT,
    "vessel" TEXT,
    "voyage" TEXT,
    "emptyReturnRequired" BOOLEAN NOT NULL DEFAULT false,
    "lastInspectionAt" TIMESTAMP(3),
    "lastInspectionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Container_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnOrder" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "shipmentId" TEXT,
    "cargoUnitId" TEXT,
    "fromOrgId" TEXT,
    "handlerOrgId" TEXT,
    "reason" TEXT NOT NULL,
    "condition" TEXT,
    "disposition" TEXT NOT NULL DEFAULT 'pending',
    "status" TEXT NOT NULL DEFAULT 'requested',
    "pickupAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReturnOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Handover" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "shipmentId" TEXT,
    "fromOrgId" TEXT,
    "toOrgId" TEXT,
    "facilityId" TEXT,
    "locationRef" TEXT,
    "condition" TEXT,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "evidenceKey" TEXT,
    "nextResponsibility" TEXT,
    "performedBy" TEXT,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Handover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomsDeclaration" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "shipmentId" TEXT,
    "direction" TEXT NOT NULL,
    "regime" TEXT NOT NULL DEFAULT 'general',
    "brokerOrgId" TEXT,
    "importerOrgId" TEXT,
    "exporterOrgId" TEXT,
    "hsCode" TEXT,
    "commodity" TEXT,
    "value" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "dutyAmount" DOUBLE PRECISION,
    "taxAmount" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "filedAt" TIMESTAMP(3),
    "examinedAt" TIMESTAMP(3),
    "clearedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "holdReason" TEXT,
    "documentKeys" TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomsDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contract_partyAOrgId_idx" ON "Contract"("partyAOrgId");

-- CreateIndex
CREATE INDEX "Contract_partyBOrgId_idx" ON "Contract"("partyBOrgId");

-- CreateIndex
CREATE INDEX "Contract_status_idx" ON "Contract"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNo_key" ON "Invoice"("invoiceNo");

-- CreateIndex
CREATE INDEX "Invoice_tripId_idx" ON "Invoice"("tripId");

-- CreateIndex
CREATE INDEX "Invoice_billFromOrgId_idx" ON "Invoice"("billFromOrgId");

-- CreateIndex
CREATE INDEX "Invoice_billToOrgId_idx" ON "Invoice"("billToOrgId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Container_number_key" ON "Container"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Container_cargoUnitId_key" ON "Container"("cargoUnitId");

-- CreateIndex
CREATE INDEX "Container_ownerOrgId_idx" ON "Container"("ownerOrgId");

-- CreateIndex
CREATE INDEX "Container_status_idx" ON "Container"("status");

-- CreateIndex
CREATE INDEX "Container_currentFacilityId_idx" ON "Container"("currentFacilityId");

-- CreateIndex
CREATE INDEX "ReturnOrder_shipmentId_idx" ON "ReturnOrder"("shipmentId");

-- CreateIndex
CREATE INDEX "ReturnOrder_status_idx" ON "ReturnOrder"("status");

-- CreateIndex
CREATE INDEX "ReturnOrder_handlerOrgId_idx" ON "ReturnOrder"("handlerOrgId");

-- CreateIndex
CREATE INDEX "Handover_entityType_entityId_idx" ON "Handover"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Handover_shipmentId_idx" ON "Handover"("shipmentId");

-- CreateIndex
CREATE INDEX "Handover_fromOrgId_idx" ON "Handover"("fromOrgId");

-- CreateIndex
CREATE INDEX "Handover_toOrgId_idx" ON "Handover"("toOrgId");

-- CreateIndex
CREATE INDEX "CustomsDeclaration_shipmentId_idx" ON "CustomsDeclaration"("shipmentId");

-- CreateIndex
CREATE INDEX "CustomsDeclaration_direction_status_idx" ON "CustomsDeclaration"("direction", "status");

-- CreateIndex
CREATE INDEX "CustomsDeclaration_brokerOrgId_idx" ON "CustomsDeclaration"("brokerOrgId");

-- CreateIndex
CREATE INDEX "Settlement_invoiceId_idx" ON "Settlement"("invoiceId");

-- AddForeignKey
ALTER TABLE "CarrierBooking" ADD CONSTRAINT "CarrierBooking_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_partyAOrgId_fkey" FOREIGN KEY ("partyAOrgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_partyBOrgId_fkey" FOREIGN KEY ("partyBOrgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_rateCardId_fkey" FOREIGN KEY ("rateCardId") REFERENCES "RateCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_billFromOrgId_fkey" FOREIGN KEY ("billFromOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_billToOrgId_fkey" FOREIGN KEY ("billToOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Container" ADD CONSTRAINT "Container_ownerOrgId_fkey" FOREIGN KEY ("ownerOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Container" ADD CONSTRAINT "Container_operatorOrgId_fkey" FOREIGN KEY ("operatorOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Container" ADD CONSTRAINT "Container_cargoUnitId_fkey" FOREIGN KEY ("cargoUnitId") REFERENCES "CargoUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Container" ADD CONSTRAINT "Container_currentFacilityId_fkey" FOREIGN KEY ("currentFacilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnOrder" ADD CONSTRAINT "ReturnOrder_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnOrder" ADD CONSTRAINT "ReturnOrder_cargoUnitId_fkey" FOREIGN KEY ("cargoUnitId") REFERENCES "CargoUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnOrder" ADD CONSTRAINT "ReturnOrder_fromOrgId_fkey" FOREIGN KEY ("fromOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnOrder" ADD CONSTRAINT "ReturnOrder_handlerOrgId_fkey" FOREIGN KEY ("handlerOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Handover" ADD CONSTRAINT "Handover_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Handover" ADD CONSTRAINT "Handover_fromOrgId_fkey" FOREIGN KEY ("fromOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Handover" ADD CONSTRAINT "Handover_toOrgId_fkey" FOREIGN KEY ("toOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Handover" ADD CONSTRAINT "Handover_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomsDeclaration" ADD CONSTRAINT "CustomsDeclaration_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomsDeclaration" ADD CONSTRAINT "CustomsDeclaration_brokerOrgId_fkey" FOREIGN KEY ("brokerOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomsDeclaration" ADD CONSTRAINT "CustomsDeclaration_importerOrgId_fkey" FOREIGN KEY ("importerOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomsDeclaration" ADD CONSTRAINT "CustomsDeclaration_exporterOrgId_fkey" FOREIGN KEY ("exporterOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

