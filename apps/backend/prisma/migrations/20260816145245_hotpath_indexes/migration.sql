-- CreateIndex
CREATE INDEX "Claim_claimantId_idx" ON "Claim"("claimantId");

-- CreateIndex
CREATE INDEX "Claim_handlerId_idx" ON "Claim"("handlerId");

-- CreateIndex
CREATE INDEX "InsurancePolicy_insurerId_idx" ON "InsurancePolicy"("insurerId");

-- CreateIndex
CREATE INDEX "Payment_tripId_status_idx" ON "Payment"("tripId", "status");

-- CreateIndex
CREATE INDEX "Payment_type_status_idx" ON "Payment"("type", "status");

-- CreateIndex
CREATE INDEX "Settlement_payerId_idx" ON "Settlement"("payerId");

-- CreateIndex
CREATE INDEX "Settlement_payeeId_idx" ON "Settlement"("payeeId");

-- CreateIndex
CREATE INDEX "Settlement_type_status_idx" ON "Settlement"("type", "status");

-- CreateIndex
CREATE INDEX "Trip_status_idx" ON "Trip"("status");

-- CreateIndex
CREATE INDEX "Trip_driverId_idx" ON "Trip"("driverId");
