-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "countryCode" TEXT NOT NULL DEFAULT 'IN';

-- CreateTable
CREATE TABLE "CountryPack" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "language" TEXT NOT NULL DEFAULT 'en',
    "unitSystem" TEXT NOT NULL DEFAULT 'metric',
    "customsRegime" TEXT NOT NULL DEFAULT 'general',
    "documentRequirements" JSONB,
    "laneDefaults" JSONB,
    "incotermsSupported" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountryPack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CountryPack_code_key" ON "CountryPack"("code");
