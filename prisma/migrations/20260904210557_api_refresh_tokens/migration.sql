-- CreateTable
CREATE TABLE "ApiRefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,

    CONSTRAINT "ApiRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiRefreshToken_tokenHash_key" ON "ApiRefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ApiRefreshToken_userId_idx" ON "ApiRefreshToken"("userId");

-- CreateIndex
CREATE INDEX "ApiRefreshToken_expiresAt_idx" ON "ApiRefreshToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "ApiRefreshToken" ADD CONSTRAINT "ApiRefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
