-- DropIndex
DROP INDEX "CarrierService_createdAt_idx";

-- DropIndex
DROP INDEX "CarrierService_destinationRef_trgm";

-- DropIndex
DROP INDEX "CarrierService_flight_trgm";

-- DropIndex
DROP INDEX "CarrierService_originRef_trgm";

-- DropIndex
DROP INDEX "CarrierService_vessel_trgm";

-- DropIndex
DROP INDEX "Facility_city_trgm";

-- DropIndex
DROP INDEX "Facility_name_trgm";

-- DropIndex
DROP INDEX "Load_createdAt_idx";

-- DropIndex
DROP INDEX "Load_description_trgm";

-- DropIndex
DROP INDEX "Load_dropAddr_trgm";

-- DropIndex
DROP INDEX "Load_haltAddr_trgm";

-- DropIndex
DROP INDEX "Load_pickupAddr_trgm";

-- DropIndex
DROP INDEX "MarketListing_city_trgm";

-- DropIndex
DROP INDEX "MarketListing_createdAt_idx";

-- DropIndex
DROP INDEX "MarketListing_description_trgm";

-- DropIndex
DROP INDEX "MarketListing_destinationRef_trgm";

-- DropIndex
DROP INDEX "MarketListing_originRef_trgm";

-- DropIndex
DROP INDEX "MarketRequest_city_trgm";

-- DropIndex
DROP INDEX "MarketRequest_createdAt_idx";

-- DropIndex
DROP INDEX "MarketRequest_description_trgm";

-- DropIndex
DROP INDEX "MarketRequest_destinationRef_trgm";

-- DropIndex
DROP INDEX "MarketRequest_originRef_trgm";

-- DropIndex
DROP INDEX "Organization_name_trgm";

-- DropIndex
DROP INDEX "Shipment_commodity_trgm";

-- DropIndex
DROP INDEX "Shipment_createdAt_idx";

-- DropIndex
DROP INDEX "Shipment_description_trgm";

-- DropIndex
DROP INDEX "Shipment_ref_trgm";

-- DropIndex
DROP INDEX "ShipmentLeg_dropAddr_trgm";

-- DropIndex
DROP INDEX "ShipmentLeg_pickupAddr_trgm";

-- DropIndex
DROP INDEX "Trip_createdAt_idx";

-- CreateIndex
CREATE INDEX "Facility_city_idx" ON "Facility"("city");

-- CreateIndex
CREATE INDEX "Shipment_createdAt_idx" ON "Shipment"("createdAt");

-- RenameIndex
ALTER INDEX "Load_fare_idx" RENAME TO "Load_fareEstimate_idx";

-- RenameIndex
ALTER INDEX "MarketListing_capacity_idx" RENAME TO "MarketListing_capacityAvailable_idx";

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
