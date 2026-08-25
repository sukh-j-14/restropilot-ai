import "server-only";

import { AIActionProposalStatus } from "@/generated/prisma/client";
import { guardAIAction } from "@/lib/ai/action-guard";
import type { ApprovalEdits } from "@/lib/services/ai-action-proposals";
import { approvePurchaseOrderProposal, rejectPurchaseOrderProposal } from "@/lib/services/ai-action-proposals";
import { executeMenuRecipeProposal } from "@/lib/services/ai-menu-recipe-actions";
import { executeInventoryProposal } from "@/lib/services/ai-inventory-actions";
import { executeSupplierProposal } from "@/lib/services/ai-supplier-actions";
import { executeReservationProposal } from "@/lib/services/ai-reservation-actions";
import { executeOrderProposal } from "@/lib/services/ai-order-actions";
import { executeRestaurantSettingsProposal } from "@/lib/services/ai-restaurant-settings-actions";
import { executePurchaseOrderStatusProposal } from "@/lib/services/ai-purchase-order-status-actions";
import { prisma } from "@/lib/prisma";
import { assertRestaurantId } from "@/lib/services/validation";

export type AIActionActor = { clerkUserId: string; orgRole: string | null | undefined };

export async function approveAIActionProposal(input: { restaurantId: string; proposalId: string; actor: AIActionActor; edits?: ApprovalEdits; now?: Date }) {
  assertRestaurantId(input.restaurantId);
  const now = input.now ?? new Date();
  const proposal = await prisma.aIActionProposal.findFirst({ where: { id: input.proposalId, restaurantId: input.restaurantId }, select: { restaurantId: true, type: true, status: true, expiresAt: true, executedPurchaseOrderId: true, executedResourceId: true } });
  if (!proposal) return { kind: "error" as const, code: "PROPOSAL_NOT_PENDING" as const, message: "This proposal is no longer available." };
  const guard = guardAIAction({ type: proposal.type, proposalRestaurantId: proposal.restaurantId, trustedRestaurantId: input.restaurantId, orgRole: input.actor.orgRole, status: proposal.status, expiresAt: proposal.expiresAt, now, resultResourceId: proposal.executedPurchaseOrderId ?? proposal.executedResourceId });
  if (guard.kind === "cross-tenant") return { kind: "error" as const, code: "PROPOSAL_NOT_PENDING" as const, message: "This proposal is no longer available." };
  if (guard.kind === "unregistered") return { kind: "error" as const, code: "UNREGISTERED_ACTION" as const, message: "This action type is not supported." };
  if (guard.kind === "unauthorized") return { kind: "error" as const, code: "UNAUTHORIZED_APPROVER" as const, message: "Only an authorized organization admin can approve this action." };
  if (guard.kind === "already-executed") return guard.registration.handlerKey === "purchase-order-draft" ? { kind: "already-executed" as const, purchaseOrderId: guard.resultResourceId } : { kind: "already-executed-resource" as const, resourceId: guard.resultResourceId };
  if (guard.kind === "expired") {
    await prisma.aIActionProposal.updateMany({ where: { id: input.proposalId, restaurantId: input.restaurantId, status: AIActionProposalStatus.PENDING, expiresAt: { lte: now } }, data: { status: AIActionProposalStatus.EXPIRED } });
    return { kind: "error" as const, code: "PROPOSAL_EXPIRED" as const, message: "This recommendation expired. Ask AI Manager to generate a new one." };
  }
  if (guard.kind === "unavailable") return { kind: "error" as const, code: "PROPOSAL_NOT_PENDING" as const, message: guard.status === "REJECTED" ? "This proposal was rejected and cannot be approved." : "This proposal can no longer be approved." };

  // The registry is authoritative. No browser- or model-supplied handler is accepted.
  if (guard.registration.handlerKey === "purchase-order-draft") return approvePurchaseOrderProposal({ restaurantId: input.restaurantId, clerkUserId: input.actor.clerkUserId, proposalId: input.proposalId, edits: input.edits, now });
  if (guard.registration.handlerKey === "menu-recipe") return executeMenuRecipeProposal({ restaurantId: input.restaurantId, clerkUserId: input.actor.clerkUserId, proposalId: input.proposalId, now });
  if (guard.registration.handlerKey === "inventory") return executeInventoryProposal({ restaurantId: input.restaurantId, clerkUserId: input.actor.clerkUserId, proposalId: input.proposalId, now });
  if (guard.registration.handlerKey === "supplier") return executeSupplierProposal({ restaurantId: input.restaurantId, clerkUserId: input.actor.clerkUserId, proposalId: input.proposalId, now });
  if (guard.registration.handlerKey === "reservation") return executeReservationProposal({ restaurantId: input.restaurantId, clerkUserId: input.actor.clerkUserId, proposalId: input.proposalId, now });
  if (guard.registration.handlerKey === "order") return executeOrderProposal({ restaurantId: input.restaurantId, clerkUserId: input.actor.clerkUserId, proposalId: input.proposalId, now });
  if (guard.registration.handlerKey === "restaurant-settings") return executeRestaurantSettingsProposal({ restaurantId: input.restaurantId, clerkUserId: input.actor.clerkUserId, proposalId: input.proposalId, now });
  if (guard.registration.handlerKey === "purchase-order-lifecycle") return executePurchaseOrderStatusProposal({ restaurantId: input.restaurantId, clerkUserId: input.actor.clerkUserId, proposalId: input.proposalId, now });
  return { kind: "error" as const, code: "UNREGISTERED_ACTION" as const, message: "This action type is not supported." };
}

export async function rejectAIActionProposal(input: { restaurantId: string; proposalId: string; actor: AIActionActor; now?: Date }) {
  assertRestaurantId(input.restaurantId);
  const now = input.now ?? new Date();
  const proposal = await prisma.aIActionProposal.findFirst({ where: { id: input.proposalId, restaurantId: input.restaurantId }, select: { restaurantId: true, type: true, status: true, expiresAt: true, executedPurchaseOrderId: true, executedResourceId: true } });
  if (!proposal) return { success: false as const, message: "This proposal is no longer available." };
  const guard = guardAIAction({ type: proposal.type, proposalRestaurantId: proposal.restaurantId, trustedRestaurantId: input.restaurantId, orgRole: input.actor.orgRole, status: proposal.status, expiresAt: proposal.expiresAt, now, resultResourceId: proposal.executedPurchaseOrderId ?? proposal.executedResourceId });
  if (guard.kind === "cross-tenant") return { success: false as const, message: "This proposal is no longer available." };
  if (guard.kind === "unregistered") return { success: false as const, message: "This action type is not supported." };
  if (guard.kind === "unauthorized") return { success: false as const, message: "Only an authorized organization admin can reject this action." };
  if (guard.kind === "expired") { await prisma.aIActionProposal.updateMany({ where: { id: input.proposalId, restaurantId: input.restaurantId, status: AIActionProposalStatus.PENDING, expiresAt: { lte: now } }, data: { status: AIActionProposalStatus.EXPIRED } }); return { success: false as const, message: "This recommendation expired. Ask AI Manager to generate a new one." }; }
  if (guard.kind !== "ready") return { success: false as const, message: "This proposal is no longer available." };
  if (guard.registration.handlerKey === "purchase-order-draft") return rejectPurchaseOrderProposal({ restaurantId: input.restaurantId, clerkUserId: input.actor.clerkUserId, proposalId: input.proposalId, now });
  if (["menu-recipe", "inventory", "supplier", "reservation", "order", "restaurant-settings", "purchase-order-lifecycle"].includes(guard.registration.handlerKey)) { const updated = await prisma.aIActionProposal.updateMany({ where: { id: input.proposalId, restaurantId: input.restaurantId, status: AIActionProposalStatus.PENDING, expiresAt: { gt: now } }, data: { status: AIActionProposalStatus.REJECTED, rejectedAt: now, rejectedByClerkUserId: input.actor.clerkUserId } }); return updated.count ? { success: true as const } : { success: false as const, message: "This proposal is no longer available." }; }
  return { success: false as const, message: "This action type is not supported." };
}
