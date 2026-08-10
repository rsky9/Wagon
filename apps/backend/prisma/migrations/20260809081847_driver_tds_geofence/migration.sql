-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'driver';

-- AlterTable
ALTER TABLE "Load" ADD COLUMN     "geofenceRadius" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "gstAmount" DOUBLE PRECISION,
ADD COLUMN     "tdsAmount" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "driverId" TEXT;
