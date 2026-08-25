ALTER TYPE "AIActionProposalType" ADD VALUE 'CREATE_INGREDIENT';
ALTER TYPE "AIActionProposalType" ADD VALUE 'UPDATE_INGREDIENT';
ALTER TYPE "AIActionProposalType" ADD VALUE 'ADJUST_INVENTORY_STOCK';

CREATE TYPE "InventoryMovementType" AS ENUM (
  'INITIAL',
  'RECEIPT',
  'USAGE',
  'WASTE',
  'ADJUSTMENT',
  'PURCHASE_ORDER_RECEIPT',
  'ORDER_CONSUMPTION'
);

CREATE TABLE "InventoryMovement" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "ingredientId" TEXT NOT NULL,
  "type" "InventoryMovementType" NOT NULL,
  "quantityDelta" DECIMAL(12,3) NOT NULL,
  "stockBefore" DECIMAL(12,3) NOT NULL,
  "stockAfter" DECIMAL(12,3) NOT NULL,
  "reason" TEXT,
  "sourceId" TEXT,
  "createdByClerkUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InventoryMovement_restaurantId_createdAt_idx" ON "InventoryMovement"("restaurantId", "createdAt");
CREATE INDEX "InventoryMovement_ingredientId_createdAt_idx" ON "InventoryMovement"("ingredientId", "createdAt");
CREATE INDEX "InventoryMovement_restaurantId_type_createdAt_idx" ON "InventoryMovement"("restaurantId", "type", "createdAt");

ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_ingredientId_fkey"
  FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
