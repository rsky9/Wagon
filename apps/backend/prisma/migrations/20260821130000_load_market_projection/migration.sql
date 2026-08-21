-- Loads that mirror a MarketRequest are an explicit, one-to-one road projection:
-- a unique nullable ref keeps the bridge idempotent and makes the derived
-- load traceable back to its canonical demand source.

ALTER TABLE "Load" ADD COLUMN "marketRequestId" TEXT;
CREATE UNIQUE INDEX "Load_marketRequestId_key" ON "Load"("marketRequestId");