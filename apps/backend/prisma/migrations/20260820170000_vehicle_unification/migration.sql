-- Unify Truck + Vehicle into a single Vehicle model.
-- 1. Rename the model catalog + maintenance tables.
ALTER TABLE "TruckModel" RENAME TO "VehicleModel";
ALTER TABLE "TruckMaintenance" RENAME TO "VehicleMaintenance";

-- 2. VerificationSource enum used by both Vehicle and Driver.
CREATE TYPE "VerificationSource" AS ENUM ('manual', 'image', 'vahan', 'ulip', 'digilocker', 'mock');

-- 3. Extend Vehicle with the operational Truck columns + verification fields.
ALTER TABLE "Vehicle" ADD COLUMN "vehicleNo" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN "type" "TruckType";
ALTER TABLE "Vehicle" ADD COLUMN "modelId" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN "capacityId" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN "driverId" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN "origin" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN "lat" DOUBLE PRECISION;
ALTER TABLE "Vehicle" ADD COLUMN "lng" DOUBLE PRECISION;
ALTER TABLE "Vehicle" ADD COLUMN "gpsLogin" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN "attachments" TEXT[] DEFAULT '{}';
ALTER TABLE "Vehicle" ADD COLUMN "images" TEXT[] DEFAULT '{}';
ALTER TABLE "Vehicle" ADD COLUMN "activeStatus" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Vehicle" ADD COLUMN "permitUpto" TIMESTAMP(3);
ALTER TABLE "Vehicle" ADD COLUMN "fitnessUpto" TIMESTAMP(3);
ALTER TABLE "Vehicle" ADD COLUMN "pollutionUpto" TIMESTAMP(3);
ALTER TABLE "Vehicle" ADD COLUMN "lastServiceAt" TIMESTAMP(3);
ALTER TABLE "Vehicle" ADD COLUMN "nextServiceKm" DOUBLE PRECISION;
ALTER TABLE "Vehicle" ADD COLUMN "odometerKm" DOUBLE PRECISION;
ALTER TABLE "Vehicle" ADD COLUMN "verificationStatus" "KycStatus" NOT NULL DEFAULT 'not_started';
ALTER TABLE "Vehicle" ADD COLUMN "verificationSource" "VerificationSource" NOT NULL DEFAULT 'manual';
ALTER TABLE "Vehicle" ADD COLUMN "verifiedAt" TIMESTAMP(3);
ALTER TABLE "Vehicle" ADD COLUMN "registeredOwner" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN "makerModel" TEXT;
ALTER TABLE "Vehicle" DROP COLUMN "permit";

-- Backfill vehicleNo for any existing legacy Vehicle rows from their RC.
UPDATE "Vehicle" SET "vehicleNo" = "rcNumber" WHERE "vehicleNo" IS NULL;
-- Reflect legacy verification status onto the unified field.
UPDATE "Vehicle" SET "verificationStatus" = status WHERE status <> 'pending';

-- 4. Migrate Truck rows into Vehicle (they hold the real operational fleet).
INSERT INTO "Vehicle" (id, "transporterId", "vehicleNo", "rcNumber", "rcVerified", "type", "modelId", "capacityId", "driverId", origin, lat, lng, "gpsLogin", "activeStatus", "insuranceUpto", "permitUpto", "fitnessUpto", "pollutionUpto", "lastServiceAt", "nextServiceKm", "odometerKm", "createdAt", "updatedAt")
SELECT id, "transporterId", "truckNo", "truckNo", false, type, "modelId", "capacityId", "driverId", origin, lat, lng, "gpsLogin", "activeStatus", "insuranceUpto", "permitUpto", "fitnessUpto", "pollutionUpto", "lastServiceAt", "nextServiceKm", "odometerKm", "createdAt", "updatedAt"
FROM "Truck";

-- Drop any legacy RC-only Vehicle rows that carry no operational profile (no type/model).
DELETE FROM "Vehicle" WHERE "type" IS NULL OR "modelId" IS NULL;

-- 5. Add Driver verification columns.
ALTER TABLE "Driver" ADD COLUMN "verificationStatus" "KycStatus" NOT NULL DEFAULT 'not_started';
ALTER TABLE "Driver" ADD COLUMN "verificationSource" "VerificationSource" NOT NULL DEFAULT 'manual';
ALTER TABLE "Driver" ADD COLUMN "verifiedAt" TIMESTAMP(3);
ALTER TABLE "Driver" ADD COLUMN "licenseImages" TEXT[] DEFAULT '{}';
-- Reflect legacy licence verification status.
UPDATE "Driver" SET "verificationStatus" = CASE WHEN "licenseVerified" THEN 'approved'::"KycStatus" ELSE 'not_started'::"KycStatus" END;

-- 6. VehicleMaintenance: rename truckId -> vehicleId and repoint FK to Vehicle.
ALTER TABLE "VehicleMaintenance" RENAME COLUMN "truckId" TO "vehicleId";
-- Drop the legacy FK that pointed at the old Truck table.
ALTER TABLE "VehicleMaintenance" DROP CONSTRAINT IF EXISTS "TruckMaintenance_truckId_fkey";
DROP INDEX IF EXISTS "TruckMaintenance_truckId_idx";
ALTER TABLE "VehicleMaintenance" ADD CONSTRAINT "VehicleMaintenance_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"(id) ON UPDATE CASCADE ON DELETE CASCADE;
CREATE INDEX "VehicleMaintenance_vehicleId_idx" ON "VehicleMaintenance"("vehicleId");

-- 7. Vehicle FKs: model -> VehicleModel, driver -> Driver (SET NULL).
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "VehicleModel"(id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"(id) ON UPDATE CASCADE ON DELETE SET NULL;
CREATE INDEX "Vehicle_driverId_idx" ON "Vehicle"("driverId");

-- 8. vehicleNo is now required.
ALTER TABLE "Vehicle" ALTER COLUMN "vehicleNo" SET NOT NULL;

-- 9. Drop the legacy Truck table (its data now lives in Vehicle).
DROP TABLE "Truck";
