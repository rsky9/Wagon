-- CreateEnum
CREATE TYPE "CommercialModel" AS ENUM ('fixed_rate', 'open_bidding', 'invite');

-- AlterTable
ALTER TABLE "Load" ADD COLUMN     "advancePct" DOUBLE PRECISION,
ADD COLUMN     "biddingDeadline" TIMESTAMP(3),
ADD COLUMN     "commercialModel" "CommercialModel" NOT NULL DEFAULT 'fixed_rate',
ADD COLUMN     "extraCharges" TEXT,
ADD COLUMN     "paymentTerms" TEXT,
ADD COLUMN     "referenceRate" DOUBLE PRECISION,
ADD COLUMN     "shortlistedTransporters" TEXT[];

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "transporterId" TEXT NOT NULL,
    "truckId" TEXT,
    "driverId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "advanceAmount" DOUBLE PRECISION,
    "balanceAmount" DOUBLE PRECISION,
    "pickupBy" TEXT,
    "etaHours" INTEGER,
    "validityHours" INTEGER NOT NULL DEFAULT 24,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NegotiationOffer" (
    "id" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "bidId" TEXT NOT NULL,
    "fromRole" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "conditions" TEXT,
    "validityHours" INTEGER NOT NULL DEFAULT 24,
    "status" TEXT NOT NULL DEFAULT 'offered',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NegotiationOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingSnapshot" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "advanceAmount" DOUBLE PRECISION,
    "balanceAmount" DOUBLE PRECISION,
    "paymentTerms" TEXT,
    "conditions" TEXT,
    "cancellationTerms" TEXT,
    "truckId" TEXT,
    "driverId" TEXT,
    "pickupWindow" TEXT,
    "deliveryWindow" TEXT,
    "supplierConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "transporterConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Bid_loadId_idx" ON "Bid"("loadId");

-- CreateIndex
CREATE INDEX "Bid_transporterId_idx" ON "Bid"("transporterId");

-- CreateIndex
CREATE INDEX "NegotiationOffer_loadId_idx" ON "NegotiationOffer"("loadId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingSnapshot_tripId_key" ON "BookingSnapshot"("tripId");

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationOffer" ADD CONSTRAINT "NegotiationOffer_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSnapshot" ADD CONSTRAINT "BookingSnapshot_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
