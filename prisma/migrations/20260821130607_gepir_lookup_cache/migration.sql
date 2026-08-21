-- CreateTable
CREATE TABLE "GepirLookup" (
    "barcode" TEXT NOT NULL,
    "company" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GepirLookup_pkey" PRIMARY KEY ("barcode")
);
