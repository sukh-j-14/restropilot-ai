const PRIVATE_KEYS = new Set(["id", "restaurantId", "ingredientId", "menuItemId", "purchaseOrderId", "supplierId", "clerkOrganizationId", "customerName", "customerEmail", "customerPhone", "email", "phone"]);

function safeValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[truncated]";
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => safeValue(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !PRIVATE_KEYS.has(key)).slice(0, 60).map(([key, item]) => [key, safeValue(item, depth + 1)]));
  }
  return String(value).slice(0, 500);
}

export function serializeToolResult(value: unknown) {
  const json = JSON.stringify(safeValue(value));
  return json.length <= 12_000 ? json : JSON.stringify({ truncated: true, preview: json.slice(0, 11_500) });
}
