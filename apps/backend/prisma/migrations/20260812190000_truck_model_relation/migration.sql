-- AddForeignKey
ALTER TABLE "Truck" ADD CONSTRAINT "Truck_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "TruckModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

