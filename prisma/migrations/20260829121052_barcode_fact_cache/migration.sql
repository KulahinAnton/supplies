-- Feature 29 — one cache table for every external barcode source.
--
-- GepirLookup answered exactly this question for one source; METRO makes it
-- two, and a third would have meant a third near-identical table.

CREATE TABLE "BarcodeFact" (
    "barcode" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "value" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BarcodeFact_pkey" PRIMARY KEY ("barcode","source")
);

-- Carry the existing answers over rather than making every cached lookup
-- happen again. `company` was always a GEPIR manufacturer name.
INSERT INTO "BarcodeFact" ("barcode", "source", "value", "fetchedAt")
SELECT "barcode", 'gepir', "company", "fetchedAt" FROM "GepirLookup";

DROP TABLE "GepirLookup";
