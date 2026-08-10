-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "billingAddress" TEXT,
ADD COLUMN     "frequentDestinations" TEXT[],
ADD COLUMN     "onboarded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pickupLocations" TEXT[],
ADD COLUMN     "preferredPayment" TEXT;

-- AlterTable
ALTER TABLE "Transporter" ADD COLUMN     "companyName" TEXT,
ADD COLUMN     "fitnessKey" TEXT,
ADD COLUMN     "fleetSize" INTEGER,
ADD COLUMN     "insuranceKey" TEXT,
ADD COLUMN     "onboarded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ownerName" TEXT,
ADD COLUMN     "permitKey" TEXT,
ADD COLUMN     "pollutionKey" TEXT;
