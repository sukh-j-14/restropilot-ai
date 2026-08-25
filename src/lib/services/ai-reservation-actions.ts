import "server-only";

import { AIActionProposalStatus, AIActionProposalType, Prisma } from "@/generated/prisma/client";
import type { AIActionProposal, ReservationProposalCandidate, ReservationProposalDisplay, ReservationProposalPayload } from "@/lib/ai/action-proposal-types";
import { getAIActionRegistration } from "@/lib/ai/action-registry";
import { prisma } from "@/lib/prisma";
import { reservationSnapshotMatches, resolveReservationMatch } from "@/lib/reservations/ai-policy";
import { canTransitionReservation, validateReservationStatus, type ReservationStatusValue } from "@/lib/reservations/policy";
import { parseReservationLocalDateTime, validateReservation } from "@/lib/reservations/validation";
import { createReservationInTransaction, transitionReservationInTransaction, updateReservationInTransaction } from "@/lib/services/reservations";
import { getRestaurantById } from "@/lib/services/restaurant";
import { assertRestaurantId } from "@/lib/services/validation";

const reservationTypes = new Set(["CREATE_RESERVATION", "UPDATE_RESERVATION", "TRANSITION_RESERVATION_STATUS"]);
const show = (status: string) => status.replaceAll("_", " ");
const displayDate = (value: string) => value.replace("T", " · ");
const difference = (label: string, current: string | undefined, proposed: string | undefined) => ({ label, ...(current !== undefined ? { current } : {}), ...(proposed !== undefined ? { proposed } : {}) });

export async function prepareReservationProposal(input: { restaurantId: string; candidate: ReservationProposalCandidate }) {
  assertRestaurantId(input.restaurantId);
  const restaurant = await getRestaurantById(input.restaurantId);
  if (!restaurant) throw new Error("Restaurant setup is required.");
  const candidate = input.candidate;
  let existing: { id: string; customerName: string; guestCount: number; reservationTime: Date; status: ReservationStatusValue; tableNumber: string | null; updatedAt: Date } | null = null;
  if (candidate.actionType !== "CREATE_RESERVATION") {
    const currentTime = candidate.currentReservationTime ? parseReservationLocalDateTime(candidate.currentReservationTime, restaurant.timezone) : null;
    if (!currentTime) throw new Error("The current reservation time is invalid for the restaurant timezone.");
    const rows = await prisma.reservation.findMany({ where: { restaurantId: input.restaurantId, customerName: { contains: candidate.customerName, mode: "insensitive" }, reservationTime: currentTime }, select: { id: true, customerName: true, guestCount: true, reservationTime: true, status: true, tableNumber: true, updatedAt: true }, take: 10 });
    const resolution = resolveReservationMatch(rows, candidate.customerName, currentTime);
    if (resolution.kind === "ambiguous") throw new Error("Multiple reservations match this guest and time. Ask the user for clarification.");
    if (resolution.kind === "missing") throw new Error("That reservation was not found in this restaurant.");
    existing = resolution.reservation;
  }

  const localTime = candidate.reservationTime ?? candidate.currentReservationTime;
  const fields = { customerName: existing?.customerName ?? candidate.customerName, guestCount: String(candidate.guestCount ?? existing?.guestCount ?? ""), reservationTime: localTime ?? "", tableNumber: candidate.tableNumber === undefined ? existing?.tableNumber ?? "" : candidate.tableNumber ?? "" };
  const validated = validateReservation(fields, { timezone: restaurant.timezone, guestCapacity: restaurant.guestCapacity });
  if (candidate.actionType !== "TRANSITION_RESERVATION_STATUS" && !validated.success) throw new Error("The proposed reservation fields are invalid or exceed configured capacity.");

  const targetStatus = candidate.status ? validateReservationStatus(candidate.status) : null;
  if (candidate.actionType === "TRANSITION_RESERVATION_STATUS" && (!existing || !targetStatus || !canTransitionReservation(existing.status, targetStatus))) throw new Error("That reservation status transition is not allowed.");
  const proposed = validated.success ? validated.data : { customerName: existing!.customerName, guestCount: existing!.guestCount, reservationTime: existing!.reservationTime, tableNumber: existing!.tableNumber };
  const proposedLocal = candidate.reservationTime ?? candidate.currentReservationTime!;
  const changes = candidate.actionType === "CREATE_RESERVATION" ? [difference("Customer", undefined, proposed.customerName), difference("Time", undefined, displayDate(proposedLocal)), difference("Guests", undefined, String(proposed.guestCount)), difference("Table", undefined, proposed.tableNumber ?? "Not assigned")]
    : candidate.actionType === "UPDATE_RESERVATION" ? [candidate.reservationTime !== undefined ? difference("Time", displayDate(candidate.currentReservationTime!), displayDate(candidate.reservationTime)) : null, candidate.guestCount !== undefined ? difference("Guests", String(existing!.guestCount), String(candidate.guestCount)) : null, candidate.tableNumber !== undefined ? difference("Table", existing!.tableNumber ?? "Not assigned", candidate.tableNumber ?? "Not assigned") : null].filter((item): item is NonNullable<typeof item> => Boolean(item))
    : [difference("Status", show(existing!.status), show(targetStatus!))];
  if (candidate.actionType === "UPDATE_RESERVATION" && (!changes.length || (proposed.reservationTime.getTime() === existing!.reservationTime.getTime() && proposed.guestCount === existing!.guestCount && proposed.tableNumber === existing!.tableNumber))) throw new Error("The proposed reservation already matches the current booking.");

  const snapshot = existing ? { customerName: existing.customerName, reservationTime: existing.reservationTime.toISOString(), guestCount: existing.guestCount, tableNumber: existing.tableNumber, status: existing.status, updatedAt: existing.updatedAt.toISOString() } : {};
  const payload: ReservationProposalPayload = { reservationId: existing?.id, customerName: proposed.customerName, reservationTime: proposed.reservationTime.toISOString(), guestCount: proposed.guestCount, tableNumber: proposed.tableNumber, status: targetStatus ?? existing?.status, snapshot };
  const display: ReservationProposalDisplay = { customerName: proposed.customerName, localDateTime: proposedLocal, guestCount: proposed.guestCount, tableNumber: proposed.tableNumber, status: targetStatus ?? existing?.status, changes };
  return { type: candidate.actionType, payload, display, explanation: candidate.explanation };
}

export async function persistReservationProposal(input: { restaurantId: string; clerkUserId: string; prepared: Awaited<ReturnType<typeof prepareReservationProposal>>; now?: Date }): Promise<AIActionProposal> {
  const now = input.now ?? new Date(); const registration = getAIActionRegistration(input.prepared.type)!;
  const row = await prisma.aIActionProposal.create({ data: { restaurantId: input.restaurantId, type: input.prepared.type as AIActionProposalType, payloadJson: input.prepared.payload as unknown as Prisma.InputJsonValue, displayJson: input.prepared.display as unknown as Prisma.InputJsonValue, explanation: input.prepared.explanation, createdByClerkUserId: input.clerkUserId, expiresAt: new Date(now.getTime() + registration.policy.expiresAfterMs) } });
  return { type: input.prepared.type, proposalId: row.id, title: registration.title, explanation: row.explanation, riskLevel: registration.policy.riskLevel, approvalRequired: true, status: "PENDING", expiresAt: row.expiresAt.toISOString(), payload: input.prepared.payload, display: input.prepared.display } as AIActionProposal;
}

export async function executeReservationProposal(input: { restaurantId: string; clerkUserId: string; proposalId: string; now?: Date }) {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (transaction) => {
    const proposal = await transaction.aIActionProposal.findFirst({ where: { id: input.proposalId, restaurantId: input.restaurantId } });
    if (!proposal || !reservationTypes.has(proposal.type)) return { kind: "error" as const, message: "This proposal is no longer available." };
    if (proposal.status === AIActionProposalStatus.EXECUTED && proposal.executedResourceId) return { kind: "already-executed" as const, resourceId: proposal.executedResourceId };
    if (proposal.status !== AIActionProposalStatus.PENDING) return { kind: "error" as const, message: "This proposal can no longer be approved." };
    if (proposal.expiresAt <= now) { await transaction.aIActionProposal.update({ where: { id: proposal.id }, data: { status: AIActionProposalStatus.EXPIRED } }); return { kind: "error" as const, message: "This recommendation expired. Ask AI Manager to generate a new one." }; }
    const payload = proposal.payloadJson as unknown as ReservationProposalPayload;
    const restaurant = await transaction.restaurant.findFirst({ where: { id: input.restaurantId }, select: { timezone: true, guestCapacity: true } });
    if (!restaurant) return { kind: "error" as const, message: "Restaurant setup is required." };
    const reservation = payload.reservationId ? await transaction.reservation.findFirst({ where: { id: payload.reservationId, restaurantId: input.restaurantId }, select: { id: true, customerName: true, guestCount: true, reservationTime: true, status: true, tableNumber: true, updatedAt: true } }) : null;
    if (payload.reservationId && (!reservation || !reservationSnapshotMatches(reservation, payload.snapshot))) return { kind: "error" as const, message: "The reservation changed since this proposal was created. Generate a fresh proposal." };
    const fields = { customerName: payload.customerName ?? "", guestCount: String(payload.guestCount ?? ""), reservationTime: payload.reservationTime ? (() => { const date = new Date(payload.reservationTime); const p = new Intl.DateTimeFormat("en-CA", { timeZone: restaurant.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date); const m = Object.fromEntries(p.filter((x) => x.type !== "literal").map((x) => [x.type, x.value])); return `${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}`; })() : "", tableNumber: payload.tableNumber ?? "" };
    const validated = validateReservation(fields, restaurant);
    if (!validated.success) return { kind: "error" as const, message: "The proposed reservation is no longer valid or exceeds configured capacity." };
    const targetStatus = payload.status ? validateReservationStatus(payload.status) : null;
    if (proposal.type === "TRANSITION_RESERVATION_STATUS" && (!reservation || !targetStatus || !canTransitionReservation(reservation.status, targetStatus))) return { kind: "error" as const, message: "That reservation status transition is no longer allowed." };
    const claimed = await transaction.aIActionProposal.updateMany({ where: { id: proposal.id, restaurantId: input.restaurantId, status: AIActionProposalStatus.PENDING, expiresAt: { gt: now } }, data: { status: AIActionProposalStatus.APPROVED, approvedAt: now, approvedByClerkUserId: input.clerkUserId } });
    if (!claimed.count) return { kind: "error" as const, message: "This proposal changed while it was being approved." };
    const result = proposal.type === "CREATE_RESERVATION" ? await createReservationInTransaction(transaction, { restaurantId: input.restaurantId, ...validated.data })
      : proposal.type === "UPDATE_RESERVATION" ? await updateReservationInTransaction(transaction, { restaurantId: input.restaurantId, reservationId: reservation!.id, ...validated.data, expectedUpdatedAt: reservation!.updatedAt })
      : await transitionReservationInTransaction(transaction, { restaurantId: input.restaurantId, reservationId: reservation!.id, to: targetStatus!, expectedStatus: reservation!.status, expectedUpdatedAt: reservation!.updatedAt });
    const resourceId = "id" in result ? result.id : result.reservationId;
    await transaction.aIActionProposal.update({ where: { id: proposal.id }, data: { status: AIActionProposalStatus.EXECUTED, executedAt: now, executedResourceId: resourceId } });
    return { kind: "executed" as const, resourceId };
  }, { maxWait: 5_000, timeout: 15_000 });
}
