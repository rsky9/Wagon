-- Trip weighbridge proof: measured weight + slip key + mismatch flag.

ALTER TABLE "Trip" ADD COLUMN "weighbridgeKg" DOUBLE PRECISION;
ALTER TABLE "Trip" ADD COLUMN "weighbridgeKey" TEXT;
ALTER TABLE "Trip" ADD COLUMN "weighbridgeMismatch" BOOLEAN;
