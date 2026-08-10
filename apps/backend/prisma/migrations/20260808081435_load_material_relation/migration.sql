-- AddForeignKey
ALTER TABLE "Load" ADD CONSTRAINT "Load_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
