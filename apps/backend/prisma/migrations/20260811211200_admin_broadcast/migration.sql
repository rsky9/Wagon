-- CreateTable
CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "role" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentTo" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Broadcast_createdAt_idx" ON "Broadcast"("createdAt");
