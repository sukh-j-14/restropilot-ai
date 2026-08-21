export type PurchaseOrderProposalCandidate = {
  supplierName: string;
  items: Array<{ ingredientName: string; quantity: number }>;
  expectedAt?: string;
  explanation: string;
};

export type PurchaseOrderProposalPayload = {
  supplierId: string;
  items: Array<{ ingredientId: string; quantity: number; unitCost: number; stockAtProposal: number; reorderLevelAtProposal: number; openIncomingAtProposal: number }>;
  expectedAt?: string;
};

export type PurchaseOrderProposalDisplay = {
  supplierName: string;
  items: Array<{ ingredientName: string; unit: string; quantity: number; unitCost: number; lineTotal: number }>;
  totalAmount: number;
};

export type AIActionProposal = {
  type: "CREATE_PURCHASE_ORDER_DRAFT";
  proposalId: string;
  title: string;
  explanation: string;
  expiresAt: string;
  payload: PurchaseOrderProposalPayload;
  display: PurchaseOrderProposalDisplay;
};
