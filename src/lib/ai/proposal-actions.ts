"use server";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { validateAIApprovalRequest } from "@/lib/ai/action-request";
import { approveAIActionProposal, rejectAIActionProposal } from "@/lib/services/ai-actions";
import { getCurrentRestaurant } from "@/lib/services/tenant";
import { prisma } from "@/lib/prisma";
import { purchaseOrderReference } from "@/lib/purchase-orders/policy";

export type ProposalActionResult = { success: true; message: string; status: "EXECUTED" | "REJECTED"; reference?: string; alreadyExecuted?: boolean } | { success: false; message: string; status?: "PENDING" | "APPROVED" | "EXECUTED" | "REJECTED" | "EXPIRED" | "FAILED" };
export type ProposalStatesResult = { success: true; proposals: Array<{ proposalId: string; status: "PENDING" | "APPROVED" | "EXECUTED" | "REJECTED" | "EXPIRED" | "FAILED" }> } | { success: false; message: string };

export async function getAIActionProposalStatesAction(input: unknown): Promise<ProposalStatesResult> {
  const executionContext = await context();
  if (!executionContext) return { success: false, message: "Sign in and select an organization." };
  if (!Array.isArray(input) || input.length > 20 || input.some((id) => typeof id !== "string" || !id || id.length > 100)) return { success: false, message: "Invalid proposal request." };
  const now = new Date();
  await prisma.aIActionProposal.updateMany({ where: { id: { in: input }, restaurantId: executionContext.restaurantId, status: "PENDING", expiresAt: { lte: now } }, data: { status: "EXPIRED" } });
  const rows = await prisma.aIActionProposal.findMany({ where: { id: { in: input }, restaurantId: executionContext.restaurantId }, select: { id: true, status: true } });
  return { success: true, proposals: rows.map((row) => ({ proposalId: row.id, status: row.status })) };
}

async function getSafeExecutionReference(restaurantId: string, proposalId: string) {
  const proposal = await prisma.aIActionProposal.findFirst({ where: { id: proposalId, restaurantId }, select: { type: true, executedPurchaseOrderId: true, executedResourceId: true } });
  if (!proposal) return undefined;
  const purchaseOrderId = proposal.executedPurchaseOrderId ?? (proposal.type === "TRANSITION_PURCHASE_ORDER_STATUS" ? proposal.executedResourceId : null);
  if (purchaseOrderId) {
    const order = await prisma.purchaseOrder.findFirst({ where: { id: purchaseOrderId, restaurantId }, select: { id: true } });
    return order ? purchaseOrderReference(order.id) : undefined;
  }
  if (["CREATE_ORDER", "UPDATE_ORDER_ITEMS", "TRANSITION_ORDER_STATUS"].includes(proposal.type) && proposal.executedResourceId) {
    const order = await prisma.order.findFirst({ where: { id: proposal.executedResourceId, restaurantId }, select: { orderNumber: true } });
    return order?.orderNumber;
  }
  return undefined;
}

async function context() {
  const session = await auth();
  if (!session.userId || !session.orgId) return null;
  const restaurant = await getCurrentRestaurant();
  return restaurant ? { restaurantId: restaurant.id, actor: { clerkUserId: session.userId, orgRole: session.orgRole } } : null;
}

export async function approveAIActionProposalAction(input: unknown): Promise<ProposalActionResult> {
  const executionContext = await context();
  if (!executionContext) return { success: false, message: "Sign in and select an organization before approving an action." };
  const request = validateAIApprovalRequest(input);
  if (!request) return { success: false, message: "Invalid approval request." };
  try {
    const result = await approveAIActionProposal({ ...executionContext, proposalId: request.proposalId, edits: { quantities: request.quantities, unitCosts: request.unitCosts, expectedAt: request.expectedAt } });
    if (result.kind === "created") { revalidatePath("/purchase-orders"); const reference = purchaseOrderReference(result.purchaseOrder.id); return { success: true, status: "EXECUTED", message: `Draft purchase order created successfully. Reference: ${reference}.`, reference }; }
    if (result.kind === "already-executed" || result.kind === "already-executed-resource") { const reference = await getSafeExecutionReference(executionContext.restaurantId, request.proposalId); return { success: true, status: "EXECUTED", message: reference ? `This approved action was already completed. Reference: ${reference}.` : "This approved action was already completed.", reference, alreadyExecuted: true }; }
    if (result.kind === "executed") { revalidatePath("/", "layout"); revalidatePath("/menu"); revalidatePath("/inventory"); revalidatePath("/suppliers"); revalidatePath("/purchase-orders"); revalidatePath("/reservations"); revalidatePath("/orders"); revalidatePath("/sales"); revalidatePath("/settings"); const reference = await getSafeExecutionReference(executionContext.restaurantId, request.proposalId); const baseMessage = "inventoryApplied" in result && result.inventoryApplied ? "Purchase order received and inventory updated successfully." : "status" in result && typeof result.status === "string" ? `Purchase order moved to ${result.status.replaceAll("_", " ").toLowerCase()} successfully.` : "Approved action completed successfully."; return { success: true, status: "EXECUTED", message: reference ? `${baseMessage} Reference: ${reference}.` : baseMessage, reference }; }
    const state = await prisma.aIActionProposal.findFirst({ where: { id: request.proposalId, restaurantId: executionContext.restaurantId }, select: { status: true } });
    return { success: false, message: result.message, status: state?.status };
  } catch { return { success: false, message: "The approval transaction could not be completed. No changes were applied. Please try again." }; }
}

export async function rejectAIActionProposalAction(proposalId: string): Promise<ProposalActionResult> {
  const executionContext = await context();
  if (!executionContext) return { success: false, message: "Sign in and select an organization before rejecting an action." };
  if (typeof proposalId !== "string" || !proposalId || proposalId.length > 100) return { success: false, message: "Invalid proposal." };
  const result = await rejectAIActionProposal({ ...executionContext, proposalId });
  return result.success ? { success: true, status: "REJECTED", message: "Proposal rejected. No changes were applied." } : result;
}

// Compatibility exports keep the existing purchase-order UI/API stable while dispatch is generic.
export const approvePurchaseOrderProposalAction = approveAIActionProposalAction;
export const rejectActionProposalAction = rejectAIActionProposalAction;
