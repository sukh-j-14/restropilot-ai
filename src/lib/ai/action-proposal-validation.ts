import type { PurchaseOrderProposalCandidate } from "@/lib/ai/action-proposal-types";

export function validateProposalCandidate(value: unknown): PurchaseOrderProposalCandidate {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error("Invalid proposal.");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["supplier_name", "items", "expected_at", "explanation"].includes(key))) throw new Error("Unsupported proposal field.");
  if (typeof record.supplier_name !== "string" || !record.supplier_name.trim() || record.supplier_name.length > 120) throw new Error("A valid supplier is required.");
  if (!Array.isArray(record.items) || !record.items.length || record.items.length > 10) throw new Error("A proposal requires 1 to 10 items.");
  const seen = new Set<string>();
  const items = record.items.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item) || Object.getPrototypeOf(item) !== Object.prototype) throw new Error("Invalid proposal item.");
    const line = item as Record<string, unknown>;
    if (Object.keys(line).some((key) => !["ingredient_name", "quantity"].includes(key))) throw new Error("Unsupported proposal item field.");
    if (typeof line.ingredient_name !== "string" || !line.ingredient_name.trim() || line.ingredient_name.length > 120) throw new Error("A valid ingredient is required.");
    if (typeof line.quantity !== "number" || !Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 999999 || Math.round(line.quantity * 1000) !== line.quantity * 1000) throw new Error("Quantity must be positive with up to 3 decimal places.");
    const normalized = line.ingredient_name.trim().toLocaleLowerCase();
    if (seen.has(normalized)) throw new Error("Duplicate ingredients are not allowed.");
    seen.add(normalized);
    return { ingredientName: line.ingredient_name.trim(), quantity: line.quantity };
  });
  let expectedAt: string | undefined;
  if (record.expected_at !== undefined && record.expected_at !== "") {
    if (typeof record.expected_at !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(record.expected_at) || Number.isNaN(new Date(`${record.expected_at}T00:00:00.000Z`).getTime())) throw new Error("Expected date is invalid.");
    expectedAt = record.expected_at;
  }
  if (typeof record.explanation !== "string" || !record.explanation.trim() || record.explanation.length > 1000) throw new Error("A concise explanation is required.");
  return { supplierName: record.supplier_name.trim(), items, ...(expectedAt ? { expectedAt } : {}), explanation: record.explanation.trim() };
}
