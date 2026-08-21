import { AIManagerError } from "@/lib/ai/errors";
import { inclusiveDateRange } from "@/lib/ai/date-context";
import type { AIRestaurantContext, AIToolDefinition } from "@/lib/ai/types";
import { PURCHASE_ORDER_STATUSES, type PurchaseOrderStatusValue } from "@/lib/purchase-orders/policy";

const names = ["get_revenue", "compare_revenue", "get_order_summary", "get_top_selling_items", "get_sales_by_hour", "get_daily_revenue", "get_low_stock_items", "get_inventory_status", "get_ingredient_usage", "get_reservation_summary", "get_expected_guests", "get_peak_reservation_hours", "list_purchase_orders"] as const;
export type ReadOnlyToolName = (typeof names)[number];
const dates = { start_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, end_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } };
const parameters = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object" as const, properties, required, additionalProperties: false as const });
const descriptions: Record<ReadOnlyToolName, string> = {
  get_revenue: "Get completed-order revenue for an inclusive restaurant-local date range.", compare_revenue: "Compare completed-order revenue between two inclusive restaurant-local date ranges.", get_order_summary: "Get aggregated order counts, statuses, completed revenue, and average order value.", get_top_selling_items: "Rank completed-order menu items by revenue or quantity.", get_sales_by_hour: "Get completed revenue and order counts by restaurant-local hour.", get_daily_revenue: "Get completed revenue grouped by restaurant-local calendar day.", get_low_stock_items: "List ingredients currently at or below their reorder level.", get_inventory_status: "Get aggregated inventory health and bounded stock details.", get_ingredient_usage: "Estimate usage of a named ingredient from completed orders and recipes.", get_reservation_summary: "Get reservation counts, statuses, and expected guests.", get_expected_guests: "Get confirmed reservation count and expected guests.", get_peak_reservation_hours: "Get reservation demand grouped by restaurant-local hour.", list_purchase_orders: "List recent purchase orders, optionally filtered by status. Cannot create or modify orders.",
};
const activities: Record<ReadOnlyToolName, string> = { get_revenue: "Checking sales...", compare_revenue: "Comparing sales...", get_order_summary: "Reviewing orders...", get_top_selling_items: "Finding top-selling dishes...", get_sales_by_hour: "Checking sales by hour...", get_daily_revenue: "Reviewing daily performance...", get_low_stock_items: "Reviewing inventory...", get_inventory_status: "Reviewing inventory...", get_ingredient_usage: "Estimating ingredient usage...", get_reservation_summary: "Checking reservations...", get_expected_guests: "Checking expected guests...", get_peak_reservation_hours: "Finding peak reservation hours...", list_purchase_orders: "Checking purchase orders..." };

const definitions: Record<ReadOnlyToolName, AIToolDefinition> = Object.fromEntries(names.map((name) => {
  let schema = parameters({});
  if (["get_revenue", "get_order_summary", "get_sales_by_hour", "get_daily_revenue", "get_reservation_summary", "get_expected_guests", "get_peak_reservation_hours"].includes(name)) schema = parameters(dates, ["start_date", "end_date"]);
  if (name === "compare_revenue") schema = parameters({ current_start_date: dates.start_date, current_end_date: dates.end_date, comparison_start_date: dates.start_date, comparison_end_date: dates.end_date }, ["current_start_date", "current_end_date", "comparison_start_date", "comparison_end_date"]);
  if (name === "get_top_selling_items") schema = parameters({ ...dates, limit: { type: "integer", minimum: 1, maximum: 20 }, ranking_mode: { type: "string", enum: ["revenue", "quantity"] } }, ["start_date", "end_date", "limit", "ranking_mode"]);
  if (name === "get_ingredient_usage") schema = parameters({ ingredient_name: { type: "string", minLength: 1, maxLength: 120 }, ...dates }, ["ingredient_name", "start_date", "end_date"]);
  if (name === "list_purchase_orders") schema = parameters({ status: { type: "string", enum: PURCHASE_ORDER_STATUSES } });
  return [name, { name, description: descriptions[name], parameters: schema }];
})) as Record<ReadOnlyToolName, AIToolDefinition>;

function object(value: unknown, keys: string[]) { if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new AIManagerError("INVALID_TOOL", "Tool arguments must be a plain object."); const record = value as Record<string, unknown>; if (Object.keys(record).some((key) => !keys.includes(key))) throw new AIManagerError("INVALID_TOOL", "Tool arguments contain unsupported fields."); return record; }
function string(record: Record<string, unknown>, key: string, max = 120) { const value = record[key]; if (typeof value !== "string" || !value.trim() || value.length > max) throw new AIManagerError("INVALID_TOOL", `${key} is invalid.`); return value.trim(); }
function range(record: Record<string, unknown>, restaurant: AIRestaurantContext, prefix = "") { const start = string(record, `${prefix}start_date`, 10); const end = string(record, `${prefix}end_date`, 10); const result = inclusiveDateRange(start, end, restaurant.timezone); if (!result) throw new AIManagerError("INVALID_TOOL", "Date range is invalid or exceeds 366 days."); return result; }

export function validateReadOnlyToolArguments(name: string, value: unknown, restaurant: AIRestaurantContext): unknown {
  if (!names.includes(name as ReadOnlyToolName)) throw new AIManagerError("INVALID_TOOL", `Unsupported tool: ${name}.`);
  if (name === "compare_revenue") { const record = object(value, ["current_start_date", "current_end_date", "comparison_start_date", "comparison_end_date"]); const current = range(record, restaurant, "current_"); const comparison = range(record, restaurant, "comparison_"); return { currentStart: current.start, currentEnd: current.end, comparisonStart: comparison.start, comparisonEnd: comparison.end }; }
  if (name === "get_top_selling_items") { const record = object(value, ["start_date", "end_date", "limit", "ranking_mode"]); const period = range(record, restaurant); if (!Number.isInteger(record.limit) || Number(record.limit) < 1 || Number(record.limit) > 20) throw new AIManagerError("INVALID_TOOL", "limit must be between 1 and 20."); if (record.ranking_mode !== "revenue" && record.ranking_mode !== "quantity") throw new AIManagerError("INVALID_TOOL", "ranking_mode is invalid."); return { ...period, limit: Number(record.limit), rankBy: record.ranking_mode }; }
  if (name === "get_ingredient_usage") { const record = object(value, ["ingredient_name", "start_date", "end_date"]); return { ingredientName: string(record, "ingredient_name"), ...range(record, restaurant) }; }
  if (name === "list_purchase_orders") { const record = object(value, ["status"]); if (record.status === undefined || record.status === "") return {}; if (typeof record.status !== "string" || !PURCHASE_ORDER_STATUSES.includes(record.status as PurchaseOrderStatusValue)) throw new AIManagerError("INVALID_TOOL", "Purchase-order status is invalid."); return { status: record.status as PurchaseOrderStatusValue }; }
  if (name === "get_low_stock_items" || name === "get_inventory_status") return object(value, []);
  const record = object(value, ["start_date", "end_date"]); return range(record, restaurant);
}

export function getReadOnlyToolContracts() { return names.map((name) => definitions[name]); }
export function getReadOnlyToolContractNames() { return [...names]; }
export function getReadOnlyToolActivity(name: string) { return names.includes(name as ReadOnlyToolName) ? activities[name as ReadOnlyToolName] : "Analyzing results..."; }
