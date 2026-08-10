-- CreateEnum
CREATE TYPE "Capability" AS ENUM ('supplier', 'transporter', 'driver');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "capabilities" "Capability"[] DEFAULT ARRAY['transporter']::"Capability"[];
