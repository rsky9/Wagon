-- CreateTable
CREATE TABLE "TruckMaintenance" (
    "id" TEXT NOT NULL,
    "truckId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "odometerKm" DOUBLE PRECISION,
    "cost" DOUBLE PRECISION,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextServiceKm" DOUBLE PRECISION,
    "notes" TEXT,
    "documents" TEXT[],
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TruckMaintenance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TruckMaintenance_truckId_idx" ON "TruckMaintenance"("truckId");

-- CreateIndex
CREATE INDEX "TruckMaintenance_performedAt_idx" ON "TruckMaintenance"("performedAt");

-- AddForeignKey
ALTER TABLE "TruckMaintenance" ADD CONSTRAINT "TruckMaintenance_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
