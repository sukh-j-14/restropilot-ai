import "server-only";
import { AIActionProposalStatus, AIActionProposalType, InventoryMovementType, Prisma } from "@/generated/prisma/client";
import type { AIActionProposal, InventoryProposalCandidate, InventoryProposalDisplay, InventoryProposalPayload } from "@/lib/ai/action-proposal-types";
import { getAIActionRegistration } from "@/lib/ai/action-registry";
import { resolveUniqueOperationalName } from "@/lib/ai/name-resolution";
import { validateIngredient } from "@/lib/catalog/validation";
import { calculateStockAdjustment, convertToBaseUnit } from "@/lib/inventory/units";
import { prisma } from "@/lib/prisma";
import { applyInventoryDeltaInTransaction, recordInventoryMovement } from "@/lib/services/inventory-movements";
import { assertRestaurantId } from "@/lib/services/validation";

const inventoryTypes = new Set(["CREATE_INGREDIENT", "UPDATE_INGREDIENT", "ADJUST_INVENTORY_STOCK"]);
const norm = (value: string) => value.trim().toLocaleLowerCase();
function resolveIngredient<T extends { name: string }>(items: T[], value: string) { const resolved = resolveUniqueOperationalName(items, value); if (resolved) return resolved; const partial = items.filter((item) => norm(item.name).includes(norm(value))); if (partial.length > 1) throw new Error(`Multiple ingredients match '${value}'. Ask the user to choose an exact name.`); if (partial.length === 1) return partial[0]; throw new Error(`Ingredient '${value}' was not found in this restaurant.`); }
function change(label: string, current: unknown, proposed: unknown, tone?: "decrease" | "increase") { return { label, ...(current !== undefined ? { current: String(current) } : {}), ...(proposed !== undefined ? { proposed: String(proposed) } : {}), ...(tone ? { tone } : {}) }; }

export async function prepareInventoryProposal(input: { restaurantId: string; candidate: InventoryProposalCandidate }) {
  assertRestaurantId(input.restaurantId);
  const ingredients = await prisma.ingredient.findMany({ where: { restaurantId: input.restaurantId }, select: { id: true, name: true, unit: true, currentStock: true, reorderLevel: true, costPerUnit: true } });
  const c = input.candidate; const ingredient = c.actionType === "CREATE_INGREDIENT" ? undefined : resolveIngredient(ingredients, c.ingredientName);
  if (c.actionType === "CREATE_INGREDIENT" && ingredients.some((item) => norm(item.name) === norm(c.ingredientName))) throw new Error("An ingredient with this name already exists.");
  const proposedName = c.name ?? c.ingredientName;
  if (c.actionType !== "ADJUST_INVENTORY_STOCK") {
    if (c.actionType === "UPDATE_INGREDIENT" && c.unit && c.unit !== ingredient!.unit) throw new Error("Changing an ingredient's base unit requires a controlled conversion and is not supported by this action.");
    const validated = validateIngredient({ name: proposedName, unit: c.unit ?? ingredient?.unit ?? "", currentStock: String(c.actionType === "CREATE_INGREDIENT" ? c.initialStock ?? 0 : ingredient!.currentStock), reorderLevel: String(c.reorderLevel ?? ingredient?.reorderLevel ?? ""), costPerUnit: String(c.costPerUnit ?? ingredient?.costPerUnit ?? "") });
    if (!validated.success) throw new Error("The proposed ingredient fields are invalid.");
    if (ingredients.some((item) => item.id !== ingredient?.id && norm(item.name) === norm(proposedName))) throw new Error("An ingredient with this name already exists.");
  }
  let normalizedQuantity: number | undefined; let countedStock: number | undefined; let stockAfter: number | undefined;
  if (c.actionType === "ADJUST_INVENTORY_STOCK") {
    if (!c.adjustmentKind) throw new Error("An inventory adjustment type is required.");
    if (!c.quantityUnit) throw new Error("An explicit quantity unit is required for inventory adjustments.");
    if (c.adjustmentKind === "COUNT") {
      if (c.countedStock === undefined) throw new Error("A counted stock value is required.");
      countedStock = convertToBaseUnit(c.countedStock, c.quantityUnit, ingredient!.unit) ?? undefined;
      if (countedStock === undefined) throw new Error(`The supplied unit is incompatible with ${ingredient!.unit}.`);
    } else {
      if (c.quantity === undefined || c.quantity <= 0) throw new Error("A positive adjustment quantity is required.");
      normalizedQuantity = convertToBaseUnit(c.quantity, c.quantityUnit, ingredient!.unit) ?? undefined;
      if (normalizedQuantity === undefined || normalizedQuantity <= 0) throw new Error(`The supplied unit is incompatible with ${ingredient!.unit}.`);
    }
    const result = calculateStockAdjustment({ currentStock: ingredient!.currentStock.toNumber(), kind: c.adjustmentKind, quantity: normalizedQuantity, countedStock });
    if (!result) throw new Error("This adjustment would make inventory negative or has invalid precision.");
    if (result.delta === 0) throw new Error("The counted stock already matches the recorded stock.");
    stockAfter = result.stockAfter;
  }
  const payload: InventoryProposalPayload = { ingredientId: ingredient?.id, name: c.actionType === "CREATE_INGREDIENT" || c.name ? proposedName : undefined, unit: c.unit, initialStock: c.initialStock ?? (c.actionType === "CREATE_INGREDIENT" ? 0 : undefined), reorderLevel: c.reorderLevel, costPerUnit: c.costPerUnit, adjustmentKind: c.adjustmentKind, normalizedQuantity, countedStock, reason: c.reason, snapshot: { name: ingredient?.name, unit: ingredient?.unit, currentStock: ingredient?.currentStock.toNumber(), reorderLevel: ingredient?.reorderLevel.toNumber(), costPerUnit: ingredient?.costPerUnit.toNumber() } };
  const display: InventoryProposalDisplay = c.actionType === "CREATE_INGREDIENT" ? { ingredientName: proposedName, unit: c.unit!, changes: [change("Unit", undefined, c.unit), change("Initial stock", undefined, c.initialStock ?? 0), change("Reorder level", undefined, c.reorderLevel ?? 0), change("Unit cost", undefined, c.costPerUnit ?? 0)] } : c.actionType === "UPDATE_INGREDIENT" ? { ingredientName: ingredient!.name, unit: c.unit ?? ingredient!.unit, changes: [change("Name", ingredient!.name, c.name), change("Unit", ingredient!.unit, c.unit), change("Reorder level", ingredient!.reorderLevel.toNumber(), c.reorderLevel), change("Unit cost", ingredient!.costPerUnit.toNumber(), c.costPerUnit)].filter((item) => item.proposed !== undefined) } : { ingredientName: ingredient!.name, unit: ingredient!.unit, movementType: c.adjustmentKind, changes: [change("Current stock", ingredient!.currentStock.toNumber(), undefined), c.adjustmentKind === "COUNT" ? change("Counted stock", undefined, countedStock, (stockAfter ?? 0) < ingredient!.currentStock.toNumber() ? "decrease" : "increase") : change(c.adjustmentKind === "RECEIPT" ? "Received" : c.adjustmentKind === "WASTE" ? "Waste" : "Used", undefined, `${c.adjustmentKind === "RECEIPT" ? "+" : "-"}${normalizedQuantity}`, c.adjustmentKind === "RECEIPT" ? "increase" : "decrease"), change("After approval", undefined, stockAfter)] };
  return { type: c.actionType, payload, display, explanation: c.explanation };
}

export async function persistInventoryProposal(input: { restaurantId: string; clerkUserId: string; prepared: Awaited<ReturnType<typeof prepareInventoryProposal>>; now?: Date }): Promise<AIActionProposal> {
  const now = input.now ?? new Date(); const registration = getAIActionRegistration(input.prepared.type)!;
  const row = await prisma.aIActionProposal.create({ data: { restaurantId: input.restaurantId, type: input.prepared.type as AIActionProposalType, payloadJson: input.prepared.payload as unknown as Prisma.InputJsonValue, displayJson: input.prepared.display as unknown as Prisma.InputJsonValue, explanation: input.prepared.explanation, createdByClerkUserId: input.clerkUserId, expiresAt: new Date(now.getTime() + registration.policy.expiresAfterMs) } });
  return { type: input.prepared.type, proposalId: row.id, title: registration.title, explanation: row.explanation, riskLevel: registration.policy.riskLevel, approvalRequired: true, status: "PENDING", expiresAt: row.expiresAt.toISOString(), payload: input.prepared.payload, display: input.prepared.display } as AIActionProposal;
}

export async function executeInventoryProposal(input: { restaurantId: string; clerkUserId: string; proposalId: string; now?: Date }) {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const proposal = await tx.aIActionProposal.findFirst({ where: { id: input.proposalId, restaurantId: input.restaurantId } });
    if (!proposal || !inventoryTypes.has(proposal.type)) return { kind: "error" as const, message: "This proposal is no longer available." };
    if (proposal.status === AIActionProposalStatus.EXECUTED && proposal.executedResourceId) return { kind: "already-executed" as const, resourceId: proposal.executedResourceId };
    if (proposal.status !== AIActionProposalStatus.PENDING) return { kind: "error" as const, message: "This proposal can no longer be approved." };
    if (proposal.expiresAt <= now) { await tx.aIActionProposal.update({ where: { id: proposal.id }, data: { status: AIActionProposalStatus.EXPIRED } }); return { kind: "error" as const, message: "This recommendation expired. Ask AI Manager to generate a new one." }; }
    const p = proposal.payloadJson as unknown as InventoryProposalPayload;
    const ingredient = p.ingredientId ? await tx.ingredient.findFirst({ where: { id: p.ingredientId, restaurantId: input.restaurantId }, select: { id: true, name: true, unit: true, currentStock: true, reorderLevel: true, costPerUnit: true } }) : null;
    if (p.ingredientId && !ingredient) return { kind: "error" as const, message: "The ingredient is no longer available for this restaurant." };
    const metadataChanged = ingredient && (ingredient.name !== p.snapshot.name || ingredient.unit !== p.snapshot.unit || ingredient.reorderLevel.toNumber() !== p.snapshot.reorderLevel || ingredient.costPerUnit.toNumber() !== p.snapshot.costPerUnit);
    if (proposal.type === "UPDATE_INGREDIENT" && (metadataChanged || ingredient!.currentStock.toNumber() !== p.snapshot.currentStock)) return { kind: "error" as const, message: "The ingredient changed since this proposal was created. Generate a fresh proposal." };
    if (proposal.type === "ADJUST_INVENTORY_STOCK" && (metadataChanged || (p.adjustmentKind === "COUNT" && ingredient!.currentStock.toNumber() !== p.snapshot.currentStock))) return { kind: "error" as const, message: "Inventory changed since this count proposal was created. Generate a fresh proposal." };
    const claimed = await tx.aIActionProposal.updateMany({ where: { id: proposal.id, restaurantId: input.restaurantId, status: AIActionProposalStatus.PENDING, expiresAt: { gt: now } }, data: { status: AIActionProposalStatus.APPROVED, approvedAt: now, approvedByClerkUserId: input.clerkUserId } });
    if (!claimed.count) return { kind: "error" as const, message: "This proposal changed while it was being approved." };
    let resourceId: string;
    if (proposal.type === "CREATE_INGREDIENT") {
      const v = validateIngredient({ name: p.name ?? "", unit: p.unit ?? "", currentStock: String(p.initialStock ?? 0), reorderLevel: String(p.reorderLevel ?? 0), costPerUnit: String(p.costPerUnit ?? 0) }); if (!v.success) throw new Error("Invalid ingredient proposal.");
      const duplicate = await tx.ingredient.findFirst({ where: { restaurantId: input.restaurantId, name: { equals: v.data.name, mode: "insensitive" } } }); if (duplicate) throw new Error("An ingredient with this name already exists.");
      const created = await tx.ingredient.create({ data: { restaurantId: input.restaurantId, ...v.data } }); resourceId = created.id;
      if (created.currentStock.isPositive()) await recordInventoryMovement(tx, { restaurantId: input.restaurantId, ingredientId: created.id, type: InventoryMovementType.INITIAL, quantityDelta: created.currentStock, stockBefore: 0, stockAfter: created.currentStock, reason: p.reason ?? "Initial inventory", createdByClerkUserId: input.clerkUserId });
    } else if (proposal.type === "UPDATE_INGREDIENT") {
      const v = validateIngredient({ name: p.name ?? ingredient!.name, unit: p.unit ?? ingredient!.unit, currentStock: ingredient!.currentStock.toString(), reorderLevel: String(p.reorderLevel ?? ingredient!.reorderLevel), costPerUnit: String(p.costPerUnit ?? ingredient!.costPerUnit) }); if (!v.success) throw new Error("Invalid ingredient proposal.");
      const duplicate = await tx.ingredient.findFirst({ where: { restaurantId: input.restaurantId, id: { not: ingredient!.id }, name: { equals: v.data.name, mode: "insensitive" } } }); if (duplicate) throw new Error("An ingredient with this name already exists.");
      await tx.ingredient.update({ where: { id: ingredient!.id, restaurantId: input.restaurantId }, data: { name: v.data.name, unit: v.data.unit, reorderLevel: v.data.reorderLevel, costPerUnit: v.data.costPerUnit } }); resourceId = ingredient!.id;
    } else {
      const calculation = calculateStockAdjustment({ currentStock: ingredient!.currentStock.toNumber(), kind: p.adjustmentKind!, quantity: p.normalizedQuantity, countedStock: p.countedStock }); if (!calculation) throw new Error("This adjustment would make inventory negative.");
      const result = await applyInventoryDeltaInTransaction(tx, { restaurantId: input.restaurantId, ingredientId: ingredient!.id, delta: calculation.delta, type: p.adjustmentKind === "RECEIPT" ? InventoryMovementType.RECEIPT : p.adjustmentKind === "USAGE" ? InventoryMovementType.USAGE : p.adjustmentKind === "WASTE" ? InventoryMovementType.WASTE : InventoryMovementType.ADJUSTMENT, reason: p.reason, createdByClerkUserId: input.clerkUserId }); resourceId = result.movementId;
    }
    await tx.aIActionProposal.update({ where: { id: proposal.id }, data: { status: AIActionProposalStatus.EXECUTED, executedAt: now, executedResourceId: resourceId } });
    return { kind: "executed" as const, resourceId };
  }, { maxWait: 5000, timeout: 15000 });
}
