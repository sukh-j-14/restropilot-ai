import "server-only";
import { AIActionProposalStatus, AIActionProposalType, Prisma } from "@/generated/prisma/client";
import type { AIActionProposal, MenuRecipeProposalCandidate, MenuRecipeProposalDisplay, MenuRecipeProposalPayload } from "@/lib/ai/action-proposal-types";
import { getAIActionRegistration } from "@/lib/ai/action-registry";
import { resolveUniqueOperationalName } from "@/lib/ai/name-resolution";
import { validateMenuItem } from "@/lib/catalog/validation";
import { validateRecipe } from "@/lib/recipes/validation";
import { prisma } from "@/lib/prisma";
import { assertRestaurantId } from "@/lib/services/validation";

const menuTypes = new Set(["CREATE_MENU_ITEM", "UPDATE_MENU_ITEM", "SET_MENU_ITEM_AVAILABILITY", "ADD_RECIPE_INGREDIENT", "UPDATE_RECIPE_INGREDIENT", "REMOVE_RECIPE_INGREDIENT"]);
const norm = (value: string) => value.trim().toLocaleLowerCase();
function uniqueByName<T extends { name: string }>(items: T[], value: string, label: string) { const resolved = resolveUniqueOperationalName(items, value); if (resolved) return resolved; const partial = items.filter((item) => norm(item.name).includes(norm(value))); if (partial.length > 1) throw new Error(`Multiple ${label}s match '${value}'. Ask the user to choose an exact name.`); if (partial.length === 1) return partial[0]; throw new Error(`${label} '${value}' was not found in this restaurant.`); }
function changes(input: Array<[string, unknown, unknown]>) { return input.filter(([, current, proposed]) => proposed !== undefined && (current === undefined || String(current) !== String(proposed))).map(([label, current, proposed]) => ({ label, ...(current !== undefined ? { current: String(current) } : {}), ...(proposed !== undefined ? { proposed: String(proposed) } : {}) })); }

export async function prepareMenuRecipeProposal(input: { restaurantId: string; candidate: MenuRecipeProposalCandidate }) {
  assertRestaurantId(input.restaurantId);
  const [menus, ingredients] = await Promise.all([
    prisma.menuItem.findMany({ where: { restaurantId: input.restaurantId }, select: { id: true, name: true, category: true, price: true, isActive: true, recipeItems: { select: { id: true, ingredientId: true, quantityRequired: true } } } }),
    prisma.ingredient.findMany({ where: { restaurantId: input.restaurantId }, select: { id: true, name: true, unit: true } }),
  ]);
  const c = input.candidate; const menu = c.actionType === "CREATE_MENU_ITEM" ? undefined : uniqueByName(menus, c.menuItemName, "menu item");
  if (c.actionType === "CREATE_MENU_ITEM" && menus.some((item) => norm(item.name) === norm(c.menuItemName))) throw new Error("A menu item with this name already exists.");
  const ingredient = c.actionType.includes("RECIPE") ? uniqueByName(ingredients, c.ingredientName ?? "", "ingredient") : undefined;
  const recipe = menu && ingredient ? menu.recipeItems.find((item) => item.ingredientId === ingredient.id) : undefined;
  if (c.actionType === "ADD_RECIPE_INGREDIENT" && recipe) throw new Error("This ingredient is already in the recipe. Propose an update instead.");
  if ((c.actionType === "UPDATE_RECIPE_INGREDIENT" || c.actionType === "REMOVE_RECIPE_INGREDIENT") && !recipe) throw new Error("This ingredient is not currently in the menu item's recipe.");
  if ((c.actionType === "ADD_RECIPE_INGREDIENT" || c.actionType === "UPDATE_RECIPE_INGREDIENT") && c.quantityRequired === undefined) throw new Error("A recipe quantity is required.");
  if (c.actionType === "SET_MENU_ITEM_AVAILABILITY" && c.isActive === undefined) throw new Error("The proposed availability is required.");
  const proposedName = c.name ?? c.menuItemName;
  if (c.actionType === "CREATE_MENU_ITEM" || c.actionType === "UPDATE_MENU_ITEM") {
    const validation = validateMenuItem({ name: proposedName, category: c.category ?? menu?.category ?? "", price: String(c.price ?? menu?.price.toNumber() ?? "") });
    if (!validation.success) throw new Error("The proposed menu item fields are invalid.");
    if (menus.some((item) => item.id !== menu?.id && norm(item.name) === norm(proposedName))) throw new Error("A menu item with this name already exists.");
  }
  if (c.quantityRequired !== undefined && !validateRecipe({ quantityRequired: String(c.quantityRequired) }).success) throw new Error("The proposed recipe quantity is invalid.");
  const payload: MenuRecipeProposalPayload = { menuItemId: menu?.id, recipeItemId: recipe?.id, ingredientId: ingredient?.id, name: c.actionType === "CREATE_MENU_ITEM" || c.name ? proposedName : undefined, category: c.category, price: c.price, isActive: c.isActive, quantityRequired: c.quantityRequired, snapshot: { name: menu?.name, category: menu?.category, price: menu?.price.toNumber(), isActive: menu?.isActive, quantityRequired: recipe?.quantityRequired.toNumber() } };
  const display: MenuRecipeProposalDisplay = { menuItemName: menu?.name ?? proposedName, ingredientName: ingredient?.name, unit: ingredient?.unit, changes: changes(c.actionType === "CREATE_MENU_ITEM" ? [["Name", undefined, proposedName], ["Category", undefined, c.category], ["Price", undefined, c.price], ["Availability", undefined, c.isActive ?? true]] : c.actionType === "SET_MENU_ITEM_AVAILABILITY" ? [["Availability", menu?.isActive ? "Available" : "Unavailable", c.isActive ? "Available" : "Unavailable"]] : c.actionType.includes("RECIPE") ? [["Quantity", recipe?.quantityRequired.toNumber(), c.actionType === "REMOVE_RECIPE_INGREDIENT" ? "Removed" : c.quantityRequired]] : [["Name", menu?.name, c.name], ["Category", menu?.category, c.category], ["Price", menu?.price.toNumber(), c.price]]) };
  if (c.actionType !== "CREATE_MENU_ITEM" && !display.changes.length) throw new Error("The proposed change already matches the current configuration.");
  return { type: c.actionType, payload, display, explanation: c.explanation };
}

export async function persistMenuRecipeProposal(input: { restaurantId: string; clerkUserId: string; prepared: Awaited<ReturnType<typeof prepareMenuRecipeProposal>>; now?: Date }): Promise<AIActionProposal> {
  const now = input.now ?? new Date(); const registration = getAIActionRegistration(input.prepared.type)!;
  const row = await prisma.aIActionProposal.create({ data: { restaurantId: input.restaurantId, type: input.prepared.type as AIActionProposalType, payloadJson: input.prepared.payload as unknown as Prisma.InputJsonValue, displayJson: input.prepared.display as unknown as Prisma.InputJsonValue, explanation: input.prepared.explanation, createdByClerkUserId: input.clerkUserId, expiresAt: new Date(now.getTime() + registration.policy.expiresAfterMs) } });
  return { type: input.prepared.type, proposalId: row.id, title: registration.title, explanation: row.explanation, riskLevel: registration.policy.riskLevel, approvalRequired: true, status: "PENDING", expiresAt: row.expiresAt.toISOString(), payload: input.prepared.payload, display: input.prepared.display } as AIActionProposal;
}

export async function executeMenuRecipeProposal(input: { restaurantId: string; clerkUserId: string; proposalId: string; now?: Date }) {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const proposal = await tx.aIActionProposal.findFirst({ where: { id: input.proposalId, restaurantId: input.restaurantId } });
    if (!proposal || !menuTypes.has(proposal.type)) return { kind: "error" as const, message: "This proposal is no longer available." };
    if (proposal.status === AIActionProposalStatus.EXECUTED && proposal.executedResourceId) return { kind: "already-executed" as const, resourceId: proposal.executedResourceId };
    if (proposal.status !== AIActionProposalStatus.PENDING) return { kind: "error" as const, message: "This proposal can no longer be approved." };
    if (proposal.expiresAt <= now) { await tx.aIActionProposal.update({ where: { id: proposal.id }, data: { status: AIActionProposalStatus.EXPIRED } }); return { kind: "error" as const, message: "This recommendation expired. Ask AI Manager to generate a new one." }; }
    const p = proposal.payloadJson as unknown as MenuRecipeProposalPayload;
    const menu = p.menuItemId ? await tx.menuItem.findFirst({ where: { id: p.menuItemId, restaurantId: input.restaurantId }, select: { id: true, name: true, category: true, price: true, isActive: true } }) : null;
    const ingredient = p.ingredientId ? await tx.ingredient.findFirst({ where: { id: p.ingredientId, restaurantId: input.restaurantId }, select: { id: true } }) : null;
    const recipe = p.recipeItemId ? await tx.recipeItem.findFirst({ where: { id: p.recipeItemId, menuItem: { restaurantId: input.restaurantId }, ingredient: { restaurantId: input.restaurantId } }, select: { id: true, quantityRequired: true } }) : null;
    if (p.menuItemId && (!menu || menu.name !== p.snapshot.name || menu.category !== p.snapshot.category || menu.price.toNumber() !== p.snapshot.price || menu.isActive !== p.snapshot.isActive)) return { kind: "error" as const, message: "The menu item changed since this proposal was created. Generate a fresh proposal." };
    if (p.ingredientId && !ingredient) return { kind: "error" as const, message: "The ingredient is no longer available for this restaurant." };
    if (p.recipeItemId && (!recipe || recipe.quantityRequired.toNumber() !== p.snapshot.quantityRequired)) return { kind: "error" as const, message: "The recipe changed since this proposal was created. Generate a fresh proposal." };
    const claimed = await tx.aIActionProposal.updateMany({ where: { id: proposal.id, restaurantId: input.restaurantId, status: AIActionProposalStatus.PENDING, expiresAt: { gt: now } }, data: { status: AIActionProposalStatus.APPROVED, approvedAt: now, approvedByClerkUserId: input.clerkUserId } });
    if (!claimed.count) return { kind: "error" as const, message: "This proposal changed while it was being approved." };
    let resourceId = "";
    if (proposal.type === "CREATE_MENU_ITEM") { const v = validateMenuItem({ name: p.name ?? "", category: p.category ?? "", price: String(p.price ?? "") }); if (!v.success) throw new Error("Invalid menu proposal."); const duplicate = await tx.menuItem.findFirst({ where: { restaurantId: input.restaurantId, name: { equals: v.data.name, mode: "insensitive" } } }); if (duplicate) throw new Error("A menu item with this name already exists."); resourceId = (await tx.menuItem.create({ data: { restaurantId: input.restaurantId, ...v.data, isActive: p.isActive ?? true } })).id; }
    else if (proposal.type === "UPDATE_MENU_ITEM") { const v = validateMenuItem({ name: p.name ?? menu!.name, category: p.category ?? menu!.category, price: String(p.price ?? menu!.price.toNumber()) }); if (!v.success) throw new Error("Invalid menu proposal."); resourceId = (await tx.menuItem.update({ where: { id: menu!.id, restaurantId: input.restaurantId }, data: v.data })).id; }
    else if (proposal.type === "SET_MENU_ITEM_AVAILABILITY") { resourceId = menu!.id; await tx.menuItem.update({ where: { id: menu!.id, restaurantId: input.restaurantId }, data: { isActive: p.isActive! } }); }
    else if (proposal.type === "ADD_RECIPE_INGREDIENT") { const exists = await tx.recipeItem.findUnique({ where: { menuItemId_ingredientId: { menuItemId: menu!.id, ingredientId: ingredient!.id } } }); if (exists) throw new Error("This ingredient is already in the recipe."); resourceId = (await tx.recipeItem.create({ data: { menuItemId: menu!.id, ingredientId: ingredient!.id, quantityRequired: String(p.quantityRequired) } })).id; }
    else if (proposal.type === "UPDATE_RECIPE_INGREDIENT") { resourceId = recipe!.id; await tx.recipeItem.update({ where: { id: recipe!.id }, data: { quantityRequired: String(p.quantityRequired) } }); }
    else { resourceId = recipe!.id; await tx.recipeItem.delete({ where: { id: recipe!.id } }); }
    await tx.aIActionProposal.update({ where: { id: proposal.id }, data: { status: AIActionProposalStatus.EXECUTED, executedAt: now, executedResourceId: resourceId } });
    return { kind: "executed" as const, resourceId };
  }, { maxWait: 5000, timeout: 15000 });
}
