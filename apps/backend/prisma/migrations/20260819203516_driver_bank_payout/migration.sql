-- AlterTable: add driver bank destination for real driver payouts
ALTER TABLE "Driver" ADD COLUMN "bankAccount" TEXT,
ADD COLUMN "ifsc" TEXT;

-- AlterEnum: add driver_payout payment type
ALTER TYPE "PaymentType" ADD VALUE IF NOT EXISTS 'driver_payout';