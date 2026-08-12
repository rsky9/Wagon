-- CreateTable
CREATE TABLE "Lane" (
    "id" TEXT NOT NULL,
    "originRef" TEXT NOT NULL,
    "destinationRef" TEXT NOT NULL,
    "originLat" DOUBLE PRECISION,
    "originLng" DOUBLE PRECISION,
    "destLat" DOUBLE PRECISION,
    "destLng" DOUBLE PRECISION,
    "distanceKm" DOUBLE PRECISION,
    "mode" TEXT NOT NULL DEFAULT 'road',
    "createdByOrgId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lane_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketListing" (
    "id" TEXT NOT NULL,
    "providerOrgId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "laneId" TEXT,
    "originRef" TEXT,
    "destinationRef" TEXT,
    "city" TEXT,
    "equipment" TEXT,
    "capacityAvailable" DOUBLE PRECISION,
    "capacityUnit" TEXT NOT NULL DEFAULT 'kg',
    "price" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "availableFrom" TIMESTAMP(3),
    "availableTo" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'live',
    "description" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "carrierServiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketRequest" (
    "id" TEXT NOT NULL,
    "requesterOrgId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "laneId" TEXT,
    "originRef" TEXT,
    "destinationRef" TEXT,
    "city" TEXT,
    "capacityNeeded" DOUBLE PRECISION,
    "capacityUnit" TEXT NOT NULL DEFAULT 'kg',
    "date" TIMESTAMP(3),
    "budget" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "sourceType" TEXT,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketQuote" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "providerOrgId" TEXT NOT NULL,
    "listingId" TEXT,
    "amount" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "etaHours" DOUBLE PRECISION,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgRating" (
    "id" TEXT NOT NULL,
    "subjectOrgId" TEXT NOT NULL,
    "giverOrgId" TEXT,
    "axis" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "review" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarrierService" (
    "id" TEXT NOT NULL,
    "carrierOrgId" TEXT NOT NULL,
    "laneId" TEXT,
    "originRef" TEXT,
    "destinationRef" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'ocean',
    "vessel" TEXT,
    "voyage" TEXT,
    "flight" TEXT,
    "departureAt" TIMESTAMP(3),
    "arrivalAt" TIMESTAMP(3),
    "equipment" TEXT,
    "totalSlots" INTEGER NOT NULL DEFAULT 1,
    "availableSlots" INTEGER NOT NULL DEFAULT 1,
    "rate" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarrierService_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lane_originRef_idx" ON "Lane"("originRef");

-- CreateIndex
CREATE INDEX "Lane_destinationRef_idx" ON "Lane"("destinationRef");

-- CreateIndex
CREATE UNIQUE INDEX "Lane_originRef_destinationRef_mode_key" ON "Lane"("originRef", "destinationRef", "mode");

-- CreateIndex
CREATE INDEX "MarketListing_kind_status_idx" ON "MarketListing"("kind", "status");

-- CreateIndex
CREATE INDEX "MarketListing_providerOrgId_idx" ON "MarketListing"("providerOrgId");

-- CreateIndex
CREATE INDEX "MarketListing_city_idx" ON "MarketListing"("city");

-- CreateIndex
CREATE INDEX "MarketRequest_kind_status_idx" ON "MarketRequest"("kind", "status");

-- CreateIndex
CREATE INDEX "MarketRequest_requesterOrgId_idx" ON "MarketRequest"("requesterOrgId");

-- CreateIndex
CREATE INDEX "MarketQuote_requestId_idx" ON "MarketQuote"("requestId");

-- CreateIndex
CREATE INDEX "MarketQuote_providerOrgId_idx" ON "MarketQuote"("providerOrgId");

-- CreateIndex
CREATE INDEX "OrgRating_subjectOrgId_axis_idx" ON "OrgRating"("subjectOrgId", "axis");

-- CreateIndex
CREATE INDEX "CarrierService_carrierOrgId_idx" ON "CarrierService"("carrierOrgId");

-- CreateIndex
CREATE INDEX "CarrierService_status_idx" ON "CarrierService"("status");

-- AddForeignKey
ALTER TABLE "Lane" ADD CONSTRAINT "Lane_createdByOrgId_fkey" FOREIGN KEY ("createdByOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketListing" ADD CONSTRAINT "MarketListing_providerOrgId_fkey" FOREIGN KEY ("providerOrgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketListing" ADD CONSTRAINT "MarketListing_laneId_fkey" FOREIGN KEY ("laneId") REFERENCES "Lane"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketListing" ADD CONSTRAINT "MarketListing_carrierServiceId_fkey" FOREIGN KEY ("carrierServiceId") REFERENCES "CarrierService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketRequest" ADD CONSTRAINT "MarketRequest_requesterOrgId_fkey" FOREIGN KEY ("requesterOrgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketRequest" ADD CONSTRAINT "MarketRequest_laneId_fkey" FOREIGN KEY ("laneId") REFERENCES "Lane"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketQuote" ADD CONSTRAINT "MarketQuote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MarketRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketQuote" ADD CONSTRAINT "MarketQuote_providerOrgId_fkey" FOREIGN KEY ("providerOrgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketQuote" ADD CONSTRAINT "MarketQuote_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgRating" ADD CONSTRAINT "OrgRating_subjectOrgId_fkey" FOREIGN KEY ("subjectOrgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgRating" ADD CONSTRAINT "OrgRating_giverOrgId_fkey" FOREIGN KEY ("giverOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierService" ADD CONSTRAINT "CarrierService_carrierOrgId_fkey" FOREIGN KEY ("carrierOrgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierService" ADD CONSTRAINT "CarrierService_laneId_fkey" FOREIGN KEY ("laneId") REFERENCES "Lane"("id") ON DELETE SET NULL ON UPDATE CASCADE;

