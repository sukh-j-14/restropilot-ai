export type PurchaseOrderApprovalRequest = { proposalId: string; quantities?: string[]; unitCosts?: string[]; expectedAt?: string };

export function validateAIApprovalRequest(input: unknown): PurchaseOrderApprovalRequest | null {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) return null;
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["proposalId", "quantities", "unitCosts", "expectedAt"].includes(key)) || typeof record.proposalId !== "string" || !record.proposalId || record.proposalId.length > 100) return null;
  if (record.quantities !== undefined && (!Array.isArray(record.quantities) || record.quantities.some((value) => typeof value !== "string"))) return null;
  if (record.unitCosts !== undefined && (!Array.isArray(record.unitCosts) || record.unitCosts.some((value) => typeof value !== "string"))) return null;
  if (record.expectedAt !== undefined && typeof record.expectedAt !== "string") return null;
  return { proposalId: record.proposalId, quantities: record.quantities as string[] | undefined, unitCosts: record.unitCosts as string[] | undefined, expectedAt: record.expectedAt as string | undefined };
}
