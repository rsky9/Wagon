-- CreateTable
CREATE TABLE "ProofOfDelivery" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "photoKey" TEXT,
    "signatureKey" TEXT,
    "consigneeName" TEXT,
    "consigneeMobile" TEXT,
    "consigneeConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "consigneeConfirmedAt" TIMESTAMP(3),
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProofOfDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProofOfDelivery_tripId_key" ON "ProofOfDelivery"("tripId");

-- CreateIndex
CREATE INDEX "ProofOfDelivery_tripId_idx" ON "ProofOfDelivery"("tripId");

-- AddForeignKey
ALTER TABLE "ProofOfDelivery" ADD CONSTRAINT "ProofOfDelivery_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

