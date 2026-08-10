-- AlterTable
ALTER TABLE "User" ADD COLUMN     "supplierVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "transporterVerified" BOOLEAN NOT NULL DEFAULT false;
