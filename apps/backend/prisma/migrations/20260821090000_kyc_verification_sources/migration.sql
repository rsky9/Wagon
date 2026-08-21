-- Role-specific KYC: add provider-based verification sources (Setu for person/
-- financial identity, face API for selfie) and track which provider verified each
-- KYC document.

-- Extend the VerificationSource enum with the new provider-backed sources.
ALTER TYPE "VerificationSource" ADD VALUE IF NOT EXISTS 'setu';
ALTER TYPE "VerificationSource" ADD VALUE IF NOT EXISTS 'face';

-- Track which provider verified each KYC document (defaults to manual admin review).
ALTER TABLE "KycDocument" ADD COLUMN "verificationSource" "VerificationSource" NOT NULL DEFAULT 'manual';
