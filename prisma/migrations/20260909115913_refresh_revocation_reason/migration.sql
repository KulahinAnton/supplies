-- CreateEnum
CREATE TYPE "RefreshRevocation" AS ENUM ('rotated', 'reuse', 'logout');

-- AlterTable
ALTER TABLE "ApiRefreshToken" ADD COLUMN     "revokedReason" "RefreshRevocation";
