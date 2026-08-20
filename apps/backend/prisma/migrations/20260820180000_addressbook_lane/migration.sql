-- Address book: reusable pickup/drop locations and contacts.
CREATE TABLE "SavedLocation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "kind" TEXT NOT NULL DEFAULT 'both',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavedContact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedContact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SavedLocation_userId_idx" ON "SavedLocation"("userId");
CREATE INDEX "SavedContact_userId_idx" ON "SavedContact"("userId");

ALTER TABLE "SavedLocation" ADD CONSTRAINT "SavedLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "SavedContact" ADD CONSTRAINT "SavedContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE CASCADE;
