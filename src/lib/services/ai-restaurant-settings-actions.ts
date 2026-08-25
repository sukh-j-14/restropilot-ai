import "server-only";

import { AIActionProposalStatus, AIActionProposalType, Prisma } from "@/generated/prisma/client";
import type { AIActionProposal, RestaurantSettingsProposalCandidate, RestaurantSettingsProposalDisplay, RestaurantSettingsProposalPayload, RestaurantSettingsSnapshot } from "@/lib/ai/action-proposal-types";
import { getAIActionRegistration } from "@/lib/ai/action-registry";
import { prisma } from "@/lib/prisma";
import { updateRestaurantSettingsInTransaction } from "@/lib/services/restaurant";
import { assertRestaurantId } from "@/lib/services/validation";
import { validateSettingsInput } from "@/lib/settings/validation";
import { restaurantSettingsSnapshot, restaurantSettingsSnapshotMatches } from "@/lib/settings/ai-policy";

const selectSettings = { name: true, phone: true, address: true, timezone: true, currency: true, guestCapacity: true, updatedAt: true } as const;
function settingsInput(value: Omit<RestaurantSettingsSnapshot, "updatedAt">) {
  return { name: value.name, phone: value.phone ?? "", address: value.address ?? "", timezone: value.timezone, currency: value.currency, guestCapacity: String(value.guestCapacity) };
}

const displayValue = (value: string | number | null) => value === null || value === "" ? "Not set" : String(value);

export async function prepareRestaurantSettingsProposal(input: { restaurantId: string; candidate: RestaurantSettingsProposalCandidate }) {
  assertRestaurantId(input.restaurantId);
  const current = await prisma.restaurant.findFirst({ where: { id: input.restaurantId }, select: selectSettings });
  if (!current) throw new Error("Restaurant settings are not available.");
  const before = restaurantSettingsSnapshot(current);
  const proposed = {
    name: input.candidate.name ?? before.name,
    phone: input.candidate.phone !== undefined ? input.candidate.phone || null : before.phone,
    address: input.candidate.address !== undefined ? input.candidate.address || null : before.address,
    timezone: input.candidate.timezone ?? before.timezone,
    currency: input.candidate.currency ?? before.currency,
    guestCapacity: input.candidate.guestCapacity ?? before.guestCapacity,
  };
  const validation = validateSettingsInput(settingsInput(proposed));
  if (!validation.success) throw new Error(validation.fieldErrors.form ?? Object.values(validation.fieldErrors)[0] ?? "The proposed settings are invalid.");

  const fields = [
    ["name", "Restaurant name"], ["phone", "Phone"], ["address", "Address"],
    ["timezone", "Timezone"], ["currency", "Currency"], ["guestCapacity", "Guest capacity"],
  ] as const;
  const changes = fields.filter(([key]) => input.candidate[key] !== undefined && before[key] !== proposed[key]).map(([key, label]) => ({ label, current: displayValue(before[key]), proposed: displayValue(proposed[key]) }));
  if (!changes.length) throw new Error("The proposed settings already match the current values.");
  const payload: RestaurantSettingsProposalPayload = { proposed: { ...validation.data, guestCapacity: validation.data.guestCapacity }, snapshot: before };
  const display: RestaurantSettingsProposalDisplay = { restaurantName: before.name, changes, timezoneChanged: before.timezone !== validation.data.timezone };
  return { type: "UPDATE_RESTAURANT_SETTINGS" as const, payload, display, explanation: input.candidate.explanation };
}

export async function persistRestaurantSettingsProposal(input: { restaurantId: string; clerkUserId: string; prepared: Awaited<ReturnType<typeof prepareRestaurantSettingsProposal>>; now?: Date }): Promise<AIActionProposal> {
  const now = input.now ?? new Date();
  const registration = getAIActionRegistration(input.prepared.type)!;
  const row = await prisma.aIActionProposal.create({ data: { restaurantId: input.restaurantId, type: AIActionProposalType.UPDATE_RESTAURANT_SETTINGS, payloadJson: input.prepared.payload as unknown as Prisma.InputJsonValue, displayJson: input.prepared.display as unknown as Prisma.InputJsonValue, explanation: input.prepared.explanation, createdByClerkUserId: input.clerkUserId, expiresAt: new Date(now.getTime() + registration.policy.expiresAfterMs) } });
  return { type: input.prepared.type, proposalId: row.id, title: registration.title, explanation: row.explanation, riskLevel: registration.policy.riskLevel, approvalRequired: true, status: "PENDING", expiresAt: row.expiresAt.toISOString(), payload: input.prepared.payload, display: input.prepared.display };
}

export async function executeRestaurantSettingsProposal(input: { restaurantId: string; clerkUserId: string; proposalId: string; now?: Date }) {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (transaction) => {
    const proposal = await transaction.aIActionProposal.findFirst({ where: { id: input.proposalId, restaurantId: input.restaurantId } });
    if (!proposal || proposal.type !== AIActionProposalType.UPDATE_RESTAURANT_SETTINGS) return { kind: "error" as const, message: "This proposal is no longer available." };
    if (proposal.status === AIActionProposalStatus.EXECUTED && proposal.executedResourceId) return { kind: "already-executed" as const, resourceId: proposal.executedResourceId };
    if (proposal.status !== AIActionProposalStatus.PENDING) return { kind: "error" as const, message: "This proposal can no longer be approved." };
    if (proposal.expiresAt <= now) { await transaction.aIActionProposal.update({ where: { id: proposal.id }, data: { status: AIActionProposalStatus.EXPIRED } }); return { kind: "error" as const, message: "This recommendation expired. Ask AI Manager to generate a new one." }; }
    const payload = proposal.payloadJson as unknown as RestaurantSettingsProposalPayload;
    const validation = validateSettingsInput(settingsInput(payload.proposed));
    if (!validation.success) return { kind: "error" as const, message: "The proposed restaurant settings are no longer valid." };
    const current = await transaction.restaurant.findFirst({ where: { id: input.restaurantId }, select: selectSettings });
    if (!current) return { kind: "error" as const, message: "Restaurant settings are no longer available." };
    if (!restaurantSettingsSnapshotMatches(current, payload.snapshot)) return { kind: "error" as const, message: "Restaurant settings changed since this proposal was created. Generate a fresh proposal." };
    const claimed = await transaction.aIActionProposal.updateMany({ where: { id: proposal.id, restaurantId: input.restaurantId, status: AIActionProposalStatus.PENDING, expiresAt: { gt: now } }, data: { status: AIActionProposalStatus.APPROVED, approvedAt: now, approvedByClerkUserId: input.clerkUserId } });
    if (!claimed.count) return { kind: "error" as const, message: "This proposal changed while it was being approved." };
    const updated = await updateRestaurantSettingsInTransaction(transaction, { restaurantId: input.restaurantId, data: validation.data });
    await transaction.aIActionProposal.update({ where: { id: proposal.id }, data: { status: AIActionProposalStatus.EXECUTED, executedAt: now, executedResourceId: updated.id } });
    return { kind: "executed" as const, resourceId: updated.id };
  }, { maxWait: 5_000, timeout: 15_000 });
}
