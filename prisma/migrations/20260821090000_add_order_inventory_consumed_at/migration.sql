-- Track the one-time recipe-based inventory consumption for each order.
ALTER TABLE "Order" ADD COLUMN "inventoryConsumedAt" TIMESTAMP(3);
