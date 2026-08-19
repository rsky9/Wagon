-- DropIndex
DROP INDEX IF EXISTS "CarrierService_createdAt_idx";

-- DropIndex
DROP INDEX IF EXISTS "CarrierService_destinationRef_trgm";

-- DropIndex
DROP INDEX IF EXISTS "CarrierService_flight_trgm";

-- DropIndex
DROP INDEX IF EXISTS "CarrierService_originRef_trgm";

-- DropIndex
DROP INDEX IF EXISTS "CarrierService_vessel_trgm";

-- DropIndex
DROP INDEX IF EXISTS "Facility_city_trgm";

-- DropIndex
DROP INDEX IF EXISTS "Facility_name_trgm";

-- DropIndex
DROP INDEX IF EXISTS "Load_createdAt_idx";

-- DropIndex
DROP INDEX IF EXISTS "Load_description_trgm";

-- DropIndex
DROP INDEX IF EXISTS "Load_dropAddr_trgm";

-- DropIndex
DROP INDEX IF EXISTS "Load_haltAddr_trgm";

-- DropIndex
DROP INDEX IF EXISTS "Load_pickupAddr_trgm";

-- DropIndex
DROP INDEX IF EXISTS "MarketListing_city_trgm";

-- DropIndex
DROP INDEX IF EXISTS "MarketListing_createdAt_idx";

-- DropIndex
DROP INDEX IF EXISTS "MarketListing_description_trgm";

-- DropIndex
DROP INDEX IF EXISTS "MarketListing_destinationRef_trgm";

-- DropIndex
DROP INDEX IF EXISTS "MarketListing_originRef_trgm";

-- DropIndex
DROP INDEX IF EXISTS "MarketRequest_city_trgm";

-- DropIndex
DROP INDEX IF EXISTS "MarketRequest_createdAt_idx";

-- DropIndex
DROP INDEX IF EXISTS "MarketRequest_description_trgm";

-- DropIndex
DROP INDEX IF EXISTS "MarketRequest_destinationRef_trgm";

-- DropIndex
DROP INDEX IF EXISTS "MarketRequest_originRef_trgm";

-- DropIndex
DROP INDEX IF EXISTS "Organization_name_trgm";

-- DropIndex
DROP INDEX IF EXISTS "Shipment_commodity_trgm";

-- DropIndex
DROP INDEX IF EXISTS "Shipment_createdAt_idx";

-- DropIndex
DROP INDEX IF EXISTS "Shipment_description_trgm";

-- DropIndex
DROP INDEX IF EXISTS "Shipment_ref_trgm";

-- DropIndex
DROP INDEX IF EXISTS "ShipmentLeg_dropAddr_trgm";

-- DropIndex
DROP INDEX IF EXISTS "ShipmentLeg_pickupAddr_trgm";

-- DropIndex
DROP INDEX IF EXISTS "Trip_createdAt_idx";

-- CreateIndex
CREATE INDEX "Facility_city_idx" ON "Facility"("city");

-- CreateIndex
CREATE INDEX "Shipment_createdAt_idx" ON "Shipment"("createdAt");

-- RenameIndex: legacy DBs renamed the column's index; fresh DBs create it here
-- (the old index was never part of the migration history, so guard on existence).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Load_fare_idx') THEN
    ALTER INDEX "Load_fare_idx" RENAME TO "Load_fareEstimate_idx";
  ELSE
    CREATE INDEX "Load_fareEstimate_idx" ON "Load" ("fareEstimate");
  END IF;
END $$;

-- RenameIndex
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'MarketListing_capacity_idx') THEN
    ALTER INDEX "MarketListing_capacity_idx" RENAME TO "MarketListing_capacityAvailable_idx";
  ELSE
    CREATE INDEX "MarketListing_capacityAvailable_idx" ON "MarketListing" ("capacityAvailable");
  END IF;
END $$;

-- pg_trgm GIN indexes for substring/ILIKE search acceleration
-- (Prisma does not model these; kept in the migration so fresh DBs get them.)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Load_pickupAddr_trgm" ON "Load" USING gin ("pickupAddr" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Load_dropAddr_trgm" ON "Load" USING gin ("dropAddr" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Load_haltAddr_trgm" ON "Load" USING gin ("haltAddr" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Load_description_trgm" ON "Load" USING gin ("description" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "MarketListing_originRef_trgm" ON "MarketListing" USING gin ("originRef" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "MarketListing_destinationRef_trgm" ON "MarketListing" USING gin ("destinationRef" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "MarketListing_city_trgm" ON "MarketListing" USING gin ("city" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "MarketListing_description_trgm" ON "MarketListing" USING gin ("description" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "MarketRequest_originRef_trgm" ON "MarketRequest" USING gin ("originRef" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "MarketRequest_destinationRef_trgm" ON "MarketRequest" USING gin ("destinationRef" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "MarketRequest_city_trgm" ON "MarketRequest" USING gin ("city" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "MarketRequest_description_trgm" ON "MarketRequest" USING gin ("description" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Shipment_commodity_trgm" ON "Shipment" USING gin ("commodity" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Shipment_description_trgm" ON "Shipment" USING gin ("description" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Shipment_ref_trgm" ON "Shipment" USING gin ("ref" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "ShipmentLeg_pickupAddr_trgm" ON "ShipmentLeg" USING gin ("pickupAddr" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "ShipmentLeg_dropAddr_trgm" ON "ShipmentLeg" USING gin ("dropAddr" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Facility_name_trgm" ON "Facility" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Facility_city_trgm" ON "Facility" USING gin ("city" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "CarrierService_originRef_trgm" ON "CarrierService" USING gin ("originRef" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "CarrierService_destinationRef_trgm" ON "CarrierService" USING gin ("destinationRef" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "CarrierService_vessel_trgm" ON "CarrierService" USING gin ("vessel" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "CarrierService_flight_trgm" ON "CarrierService" USING gin ("flight" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Organization_name_trgm" ON "Organization" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Trip_createdAt_idx" ON "Trip" ("createdAt" DESC);
