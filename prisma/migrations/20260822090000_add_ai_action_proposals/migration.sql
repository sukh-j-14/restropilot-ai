CREATE TYPE "AIActionProposalType" AS ENUM ('CREATE_PURCHASE_ORDER_DRAFT');
CREATE TYPE "AIActionProposalStatus" AS ENUM ('PENDING', 'APPROVED', 'EXECUTED', 'REJECTED', 'EXPIRED', 'FAILED');

CREATE TABLE "AIActionProposal" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "type" "AIActionProposalType" NOT NULL,
    "status" "AIActionProposalStatus" NOT NULL DEFAULT 'PENDING',
    "payloadJson" JSONB NOT NULL,
    "displayJson" JSONB NOT NULL,
    "explanation" TEXT NOT NULL,
    "createdByClerkUserId" TEXT NOT NULL,
    "approvedByClerkUserId" TEXT,
    "rejectedByClerkUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "executedPurchaseOrderId" TEXT,
    CONSTRAINT "AIActionProposal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AIActionProposal_executedPurchaseOrderId_key" ON "AIActionProposal"("executedPurchaseOrderId");
CREATE INDEX "AIActionProposal_restaurantId_status_createdAt_idx" ON "AIActionProposal"("restaurantId", "status", "createdAt");
CREATE INDEX "AIActionProposal_expiresAt_idx" ON "AIActionProposal"("expiresAt");
ALTER TABLE "AIActionProposal" ADD CONSTRAINT "AIActionProposal_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AIActionProposal" ADD CONSTRAINT "AIActionProposal_executedPurchaseOrderId_fkey" FOREIGN KEY ("executedPurchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
