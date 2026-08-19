-- CreateTable
CREATE TABLE "EdiMessage" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "partnerOrgId" TEXT,
    "direction" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "interchangeId" TEXT,
    "controlNumber" TEXT,
    "raw" TEXT NOT NULL,
    "segments" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "error" TEXT,
    "mappingVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EdiMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EdiMessage_orgId_idx" ON "EdiMessage"("orgId");

-- CreateIndex
CREATE INDEX "EdiMessage_direction_idx" ON "EdiMessage"("direction");

-- CreateIndex
CREATE INDEX "EdiMessage_status_idx" ON "EdiMessage"("status");

-- CreateIndex
CREATE INDEX "EdiMessage_entityType_entityId_idx" ON "EdiMessage"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "EdiMessage" ADD CONSTRAINT "EdiMessage_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EdiMessage" ADD CONSTRAINT "EdiMessage_partnerOrgId_fkey" FOREIGN KEY ("partnerOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

