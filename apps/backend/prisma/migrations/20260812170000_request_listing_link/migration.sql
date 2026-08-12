-- AlterTable
ALTER TABLE "MarketRequest" ADD COLUMN     "listingId" TEXT;

-- CreateIndex
CREATE INDEX "MarketRequest_listingId_idx" ON "MarketRequest"("listingId");

-- AddForeignKey
ALTER TABLE "MarketRequest" ADD CONSTRAINT "MarketRequest_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

