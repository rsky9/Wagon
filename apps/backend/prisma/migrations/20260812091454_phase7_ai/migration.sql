-- CreateTable
CREATE TABLE "AiRecommendation" (
    "id" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "output" JSONB NOT NULL,
    "constraints" JSONB,
    "rationale" JSONB,
    "guardrails" JSONB,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiRecommendation_entityType_entityId_idx" ON "AiRecommendation"("entityType", "entityId");
