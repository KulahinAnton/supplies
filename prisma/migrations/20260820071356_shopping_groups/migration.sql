-- AlterTable
ALTER TABLE "ShoppingListItem" ADD COLUMN     "groupId" TEXT;

-- CreateTable
CREATE TABLE "ShoppingGroup" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShoppingGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShoppingGroup_householdId_name_key" ON "ShoppingGroup"("householdId", "name");

-- CreateIndex
CREATE INDEX "ShoppingListItem_groupId_idx" ON "ShoppingListItem"("groupId");

-- AddForeignKey
ALTER TABLE "ShoppingGroup" ADD CONSTRAINT "ShoppingGroup_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingListItem" ADD CONSTRAINT "ShoppingListItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ShoppingGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
