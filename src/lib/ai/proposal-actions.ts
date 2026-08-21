"use server";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { approvePurchaseOrderProposal, rejectPurchaseOrderProposal } from "@/lib/services/ai-action-proposals";
import { getCurrentRestaurant } from "@/lib/services/tenant";
export type ProposalActionResult = { success: true; message: string; purchaseOrderId?: string; alreadyExecuted?: boolean } | { success: false; message: string };
async function context() { const session = await auth(); if (!session.userId || !session.orgId || session.orgRole !== "org:admin") return null; const restaurant = await getCurrentRestaurant(); return restaurant ? { restaurantId: restaurant.id, clerkUserId: session.userId } : null; }
export async function approvePurchaseOrderProposalAction(input: unknown): Promise<ProposalActionResult> {
  const actor = await context(); if (!actor) return { success: false, message: "Only an authorized organization admin can approve procurement drafts." };
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) return { success: false, message: "Invalid approval request." };
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["proposalId", "quantities", "unitCosts", "expectedAt"].includes(key)) || typeof record.proposalId !== "string" || !record.proposalId || record.proposalId.length > 100) return { success: false, message: "Invalid approval request." };
  if (record.quantities !== undefined && (!Array.isArray(record.quantities) || record.quantities.some((value) => typeof value !== "string"))) return { success: false, message: "Invalid quantities." };
  if (record.unitCosts !== undefined && (!Array.isArray(record.unitCosts) || record.unitCosts.some((value) => typeof value !== "string"))) return { success: false, message: "Invalid unit costs." };
  if (record.expectedAt !== undefined && typeof record.expectedAt !== "string") return { success: false, message: "Invalid expected date." };
  try { const result = await approvePurchaseOrderProposal({ ...actor, proposalId: record.proposalId, edits: { quantities: record.quantities as string[] | undefined, unitCosts: record.unitCosts as string[] | undefined, expectedAt: record.expectedAt as string | undefined } }); if (result.kind === "created") { revalidatePath("/purchase-orders"); return { success: true, message: "Draft purchase order created successfully.", purchaseOrderId: result.purchaseOrder.id }; } if (result.kind === "already-executed") return { success: true, message: "This proposal already created a draft purchase order.", purchaseOrderId: result.purchaseOrderId, alreadyExecuted: true }; return { success: false, message: result.message }; } catch { return { success: false, message: "The approval transaction could not be completed, and no draft was created. Please try again." }; }
}
export async function rejectActionProposalAction(proposalId: string): Promise<ProposalActionResult> { const actor = await context(); if (!actor) return { success: false, message: "Only an authorized organization admin can reject procurement proposals." }; if (typeof proposalId !== "string" || !proposalId || proposalId.length > 100) return { success: false, message: "Invalid proposal." }; const result = await rejectPurchaseOrderProposal({ ...actor, proposalId }); return result.success ? { success: true, message: "Proposal rejected. No purchase order was created." } : result; }
