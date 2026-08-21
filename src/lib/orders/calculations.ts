import { Prisma } from "@/generated/prisma/client";

export type PricedOrderLine = { menuItemId: string; quantity: number; unitPrice: string };
export type RecipeUsageLine = { menuItemId: string; menuItemName: string; ingredientId: string; ingredientName: string; unit: string; quantityRequired: string; orderQuantity: number };
export type StockAvailability = { ingredientId: string; ingredientName: string; unit: string; currentStock: string };

export function calculateOrderTotals(lines: PricedOrderLine[], discount: string, tax: string) {
  const subtotal = lines.reduce((sum, line) => sum.plus(new Prisma.Decimal(line.unitPrice).mul(line.quantity)), new Prisma.Decimal(0)).toDecimalPlaces(2);
  const discountValue = new Prisma.Decimal(discount).toDecimalPlaces(2);
  const taxValue = new Prisma.Decimal(tax).toDecimalPlaces(2);
  const total = subtotal.minus(discountValue).plus(taxValue);
  return { subtotal: subtotal.toFixed(2), discount: discountValue.toFixed(2), tax: taxValue.toFixed(2), total: total.toFixed(2) };
}

export function aggregateIngredientUsage(lines: RecipeUsageLine[]) {
  const aggregate = new Map<string, { ingredientId: string; ingredientName: string; unit: string; required: Prisma.Decimal }>();
  for (const line of lines) {
    const required = new Prisma.Decimal(line.quantityRequired).mul(line.orderQuantity);
    const existing = aggregate.get(line.ingredientId);
    if (existing) existing.required = existing.required.plus(required);
    else aggregate.set(line.ingredientId, { ingredientId: line.ingredientId, ingredientName: line.ingredientName, unit: line.unit, required });
  }
  return [...aggregate.values()].map((item) => ({ ingredientId: item.ingredientId, ingredientName: item.ingredientName, unit: item.unit, required: item.required.toDecimalPlaces(3).toFixed(3) }));
}

export function findMissingRecipeItems(items: Array<{ menuItemId: string; menuItemName: string; recipeItemCount: number }>) {
  return items.filter((item) => item.recipeItemCount === 0).map((item) => ({ menuItemId: item.menuItemId, menuItemName: item.menuItemName }));
}

export function findInventoryShortages(requirements: ReturnType<typeof aggregateIngredientUsage>, stock: StockAvailability[]) {
  const stockById = new Map(stock.map((item) => [item.ingredientId, item]));
  return requirements.flatMap((requirement) => {
    const available = new Prisma.Decimal(stockById.get(requirement.ingredientId)?.currentStock ?? 0);
    const required = new Prisma.Decimal(requirement.required);
    if (available.greaterThanOrEqualTo(required)) return [];
    return [{ ingredientId: requirement.ingredientId, ingredientName: requirement.ingredientName, unit: requirement.unit, required: required.toFixed(3), available: available.toFixed(3), shortage: required.minus(available).toFixed(3) }];
  });
}
