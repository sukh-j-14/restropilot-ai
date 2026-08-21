-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "address" TEXT,
ADD COLUMN     "guestCapacity" INTEGER DEFAULT 96,
ADD COLUMN     "phone" TEXT;
