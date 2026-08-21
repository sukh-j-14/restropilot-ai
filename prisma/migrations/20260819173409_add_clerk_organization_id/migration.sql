-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN "clerkOrganizationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_clerkOrganizationId_key" ON "Restaurant"("clerkOrganizationId");
