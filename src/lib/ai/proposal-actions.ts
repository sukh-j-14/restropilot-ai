"use server";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { validateAIApprovalRequest } from "@/lib/ai/action-request";
import { approveAIActionProposal, rejectAIActionProposal } from "@/lib/services/ai-actions";
import { getCurrentRestaurant } from "@/lib/services/tenant";

export type ProposalActionResult = { success: true; message: string; status: "EXECUTED" | "REJECTED"; purchaseOrderId?: string; resourceId?: string; alreadyExecuted?: boolean } | { success: false; message: string };

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
    if (result.kind === "created") { revalidatePath("/purchase-orders"); return { success: true, status: "EXECUTED", message: "Draft purchase order created successfully.", purchaseOrderId: result.purchaseOrder.id }; }
    if (result.kind === "already-executed") return "purchaseOrderId" in result ? { success: true, status: "EXECUTED", message: "This proposal already created a draft purchase order.", purchaseOrderId: result.purchaseOrderId, alreadyExecuted: true } : { success: true, status: "EXECUTED", message: "This approved action was already completed.", resourceId: result.resourceId, alreadyExecuted: true };
    if (result.kind === "already-executed-resource") return { success: true, status: "EXECUTED", message: "This approved action was already completed.", resourceId: result.resourceId, alreadyExecuted: true };
    if (result.kind === "executed") { revalidatePath("/", "layout"); revalidatePath("/menu"); revalidatePath("/inventory"); revalidatePath("/suppliers"); revalidatePath("/purchase-orders"); revalidatePath("/reservations"); revalidatePath("/orders"); revalidatePath("/sales"); revalidatePath("/settings"); const message = "inventoryApplied" in result && result.inventoryApplied ? "Purchase order received and inventory updated successfully." : "status" in result && typeof result.status === "string" ? `Purchase order moved to ${result.status.replaceAll("_", " ").toLowerCase()} successfully.` : "Approved action completed successfully."; return { success: true, status: "EXECUTED", message, resourceId: result.resourceId }; }
    return { success: false, message: result.message };
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
