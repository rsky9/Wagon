-- AlterTable
ALTER TABLE "IntegrationConnector" ADD COLUMN     "apiKeyHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnector_apiKeyHash_key" ON "IntegrationConnector"("apiKeyHash");

