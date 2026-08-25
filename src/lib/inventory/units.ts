import { Prisma } from "@/generated/prisma/client";

export const QUANTITY_UNITS = ["kg", "g", "litre", "ml", "piece"] as const;
export type QuantityUnit = (typeof QUANTITY_UNITS)[number];

const aliases: Record<string, QuantityUnit> = {
  kg: "kg", kilogram: "kg", kilograms: "kg",
  g: "g", gram: "g", grams: "g",
  litre: "litre", litres: "litre", liter: "litre", liters: "litre", l: "litre",
  ml: "ml", millilitre: "ml", millilitres: "ml", milliliter: "ml", milliliters: "ml",
  piece: "piece", pieces: "piece", pc: "piece", pcs: "piece",
};

export function normalizeQuantityUnit(value: string): QuantityUnit | null {
  return aliases[value.trim().toLocaleLowerCase()] ?? null;
}

export function convertToBaseUnit(quantity: number, sourceUnit: string, baseUnit: string): number | null {
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  const source = normalizeQuantityUnit(sourceUnit);
  const base = normalizeQuantityUnit(baseUnit);
  if (!source || !base) return null;
  let factor: number;
  if (source === base) factor = 1;
  else if (source === "g" && base === "kg") factor = 0.001;
  else if (source === "kg" && base === "g") factor = 1000;
  else if (source === "ml" && base === "litre") factor = 0.001;
  else if (source === "litre" && base === "ml") factor = 1000;
  else return null;
  const converted = new Prisma.Decimal(quantity).mul(factor);
  if (converted.decimalPlaces() > 3 || converted.greaterThan("999999999.999")) return null;
  return converted.toNumber();
}

export function calculateStockAdjustment(input: { currentStock: number; kind: "RECEIPT" | "USAGE" | "WASTE" | "COUNT"; quantity?: number; countedStock?: number }) {
  const current = new Prisma.Decimal(input.currentStock);
  const delta = input.kind === "COUNT"
    ? new Prisma.Decimal(input.countedStock ?? Number.NaN).minus(current)
    : new Prisma.Decimal(input.quantity ?? Number.NaN).mul(input.kind === "RECEIPT" ? 1 : -1);
  const after = current.add(delta);
  if (!delta.isFinite() || !after.isFinite() || after.isNegative() || after.decimalPlaces() > 3) return null;
  return { delta: delta.toNumber(), stockAfter: after.toNumber() };
}
