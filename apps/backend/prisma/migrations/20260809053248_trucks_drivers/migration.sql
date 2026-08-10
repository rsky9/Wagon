-- AddForeignKey
ALTER TABLE "RateCard" ADD CONSTRAINT "RateCard_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "TruckModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
