-- CreateEnum
CREATE TYPE "TripStage" AS ENUM ('accepted', 'enroute_pickup', 'arrived_pickup', 'loading', 'loaded', 'enroute_drop', 'arrived_drop', 'unloading', 'delivered');

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "deliveryOtp" TEXT,
ADD COLUMN     "deliveryOtpAt" TIMESTAMP(3),
ADD COLUMN     "pickupOtp" TEXT,
ADD COLUMN     "pickupOtpAt" TIMESTAMP(3),
ADD COLUMN     "stage" "TripStage" NOT NULL DEFAULT 'accepted';
