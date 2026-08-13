-- CreateTable
CREATE TABLE "CargoUnit" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'package',
    "weightKg" DOUBLE PRECISION,
    "volumeM3" DOUBLE PRECISION,
    "pieces" INTEGER,
    "equipment" TEXT,
    "shipmentId" TEXT,
    "legId" TEXT,
    "parentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'created',
    "locationRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CargoUnit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CargoUnit_shipmentId_idx" ON "CargoUnit"("shipmentId");

-- CreateIndex
CREATE INDEX "CargoUnit_parentId_idx" ON "CargoUnit"("parentId");

-- AddForeignKey
ALTER TABLE "CargoUnit" ADD CONSTRAINT "CargoUnit_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargoUnit" ADD CONSTRAINT "CargoUnit_legId_fkey" FOREIGN KEY ("legId") REFERENCES "ShipmentLeg"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargoUnit" ADD CONSTRAINT "CargoUnit_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CargoUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

