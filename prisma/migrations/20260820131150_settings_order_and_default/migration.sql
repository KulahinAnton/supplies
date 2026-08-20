-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "StorageLocation" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false;
