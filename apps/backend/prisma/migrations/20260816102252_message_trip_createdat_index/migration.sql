-- DropIndex
DROP INDEX "Message_tripId_idx";

-- CreateIndex
CREATE INDEX "Message_tripId_createdAt_idx" ON "Message"("tripId", "createdAt");
