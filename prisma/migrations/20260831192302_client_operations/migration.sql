-- CreateTable
CREATE TABLE "ClientOperation" (
    "clientOpId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "errorKey" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientOperation_pkey" PRIMARY KEY ("clientOpId")
);

-- CreateIndex
CREATE INDEX "ClientOperation_householdId_appliedAt_idx" ON "ClientOperation"("householdId", "appliedAt");
