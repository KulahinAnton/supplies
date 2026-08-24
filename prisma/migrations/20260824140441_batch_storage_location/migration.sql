-- AlterTable
ALTER TABLE "StockBatch" ADD COLUMN     "locationId" TEXT;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StorageLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Feature 22 backfill.
--
-- Every batch that existed before this migration was, implicitly, wherever its
-- item said it was — that was the only place the app could express. Copying the
-- item's location makes that implicit fact explicit, so existing stock keeps
-- displaying the same location instead of silently becoming "unspecified".
--
-- Items with no location copy NULL, which is the same statement: unknown.
UPDATE "StockBatch" b
SET "locationId" = i."locationId"
FROM "Item" i
WHERE b."itemId" = i."id"
  AND i."locationId" IS NOT NULL;
