-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "kybcNote" TEXT,
ADD COLUMN     "kybcStatus" TEXT NOT NULL DEFAULT 'not_started',
ADD COLUMN     "kybcVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "kybcVerifiedBy" TEXT,
ADD COLUMN     "parentOrgId" TEXT,
ADD COLUMN     "registeredAddress" TEXT,
ADD COLUMN     "registrationNumber" TEXT;

-- CreateTable
CREATE TABLE "Dock" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'loading',
    "equipment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'available',
    "busyUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledAppointment" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "dockId" TEXT,
    "orgId" TEXT,
    "shipmentId" TEXT,
    "vehicleNo" TEXT,
    "containerId" TEXT,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "gateInAt" TIMESTAMP(3),
    "gateOutAt" TIMESTAMP(3),
    "cargoPieces" INTEGER,
    "cargoWeightKg" DOUBLE PRECISION,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeDocument" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "shipmentId" TEXT,
    "issuerOrgId" TEXT,
    "recipientOrgId" TEXT,
    "carrierOrgId" TEXT,
    "lines" JSONB NOT NULL,
    "totalValue" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "incoterms" TEXT,
    "originRef" TEXT,
    "destinationRef" TEXT,
    "signedBy" TEXT,
    "signedAt" TIMESTAMP(3),
    "released" BOOLEAN NOT NULL DEFAULT false,
    "releasedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'issued',
    "fileKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationDocument" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "adminNote" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Dock_facilityId_idx" ON "Dock"("facilityId");

-- CreateIndex
CREATE INDEX "Dock_status_idx" ON "Dock"("status");

-- CreateIndex
CREATE INDEX "ScheduledAppointment_facilityId_idx" ON "ScheduledAppointment"("facilityId");

-- CreateIndex
CREATE INDEX "ScheduledAppointment_windowStart_idx" ON "ScheduledAppointment"("windowStart");

-- CreateIndex
CREATE INDEX "ScheduledAppointment_status_idx" ON "ScheduledAppointment"("status");

-- CreateIndex
CREATE INDEX "ScheduledAppointment_orgId_idx" ON "ScheduledAppointment"("orgId");

-- CreateIndex
CREATE INDEX "TradeDocument_shipmentId_idx" ON "TradeDocument"("shipmentId");

-- CreateIndex
CREATE INDEX "TradeDocument_docType_idx" ON "TradeDocument"("docType");

-- CreateIndex
CREATE INDEX "TradeDocument_issuerOrgId_idx" ON "TradeDocument"("issuerOrgId");

-- CreateIndex
CREATE INDEX "TradeDocument_recipientOrgId_idx" ON "TradeDocument"("recipientOrgId");

-- CreateIndex
CREATE INDEX "OrganizationDocument_orgId_kind_idx" ON "OrganizationDocument"("orgId", "kind");

-- CreateIndex
CREATE INDEX "Organization_parentOrgId_idx" ON "Organization"("parentOrgId");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_parentOrgId_fkey" FOREIGN KEY ("parentOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dock" ADD CONSTRAINT "Dock_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledAppointment" ADD CONSTRAINT "ScheduledAppointment_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledAppointment" ADD CONSTRAINT "ScheduledAppointment_dockId_fkey" FOREIGN KEY ("dockId") REFERENCES "Dock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledAppointment" ADD CONSTRAINT "ScheduledAppointment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledAppointment" ADD CONSTRAINT "ScheduledAppointment_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledAppointment" ADD CONSTRAINT "ScheduledAppointment_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeDocument" ADD CONSTRAINT "TradeDocument_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeDocument" ADD CONSTRAINT "TradeDocument_issuerOrgId_fkey" FOREIGN KEY ("issuerOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeDocument" ADD CONSTRAINT "TradeDocument_recipientOrgId_fkey" FOREIGN KEY ("recipientOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeDocument" ADD CONSTRAINT "TradeDocument_carrierOrgId_fkey" FOREIGN KEY ("carrierOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationDocument" ADD CONSTRAINT "OrganizationDocument_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

