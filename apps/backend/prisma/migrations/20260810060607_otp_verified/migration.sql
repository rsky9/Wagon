-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "deliveryOtpVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "pickupOtpVerifiedAt" TIMESTAMP(3);
