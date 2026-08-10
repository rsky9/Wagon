-- AlterTable
ALTER TABLE "Truck" ADD COLUMN     "fitnessUpto" TIMESTAMP(3),
ADD COLUMN     "insuranceUpto" TIMESTAMP(3),
ADD COLUMN     "lastServiceAt" TIMESTAMP(3),
ADD COLUMN     "nextServiceKm" DOUBLE PRECISION,
ADD COLUMN     "odometerKm" DOUBLE PRECISION,
ADD COLUMN     "permitUpto" TIMESTAMP(3),
ADD COLUMN     "pollutionUpto" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "loadAlerts" BOOLEAN NOT NULL DEFAULT true,
    "booking" BOOLEAN NOT NULL DEFAULT true,
    "trip" BOOLEAN NOT NULL DEFAULT true,
    "payment" BOOLEAN NOT NULL DEFAULT true,
    "kyc" BOOLEAN NOT NULL DEFAULT true,
    "docExpiry" BOOLEAN NOT NULL DEFAULT true,
    "promo" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
