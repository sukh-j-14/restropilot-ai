CREATE TYPE "ImportType" AS ENUM ('HISTORICAL_ORDERS', 'HISTORICAL_RESERVATIONS');

CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "type" "ImportType" NOT NULL,
    "filename" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "importedCount" INTEGER NOT NULL,
    "failedCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImportBatch_restaurantId_createdAt_idx" ON "ImportBatch"("restaurantId", "createdAt");
CREATE INDEX "ImportBatch_restaurantId_type_idx" ON "ImportBatch"("restaurantId", "type");

ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_restaurantId_fkey"
FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
