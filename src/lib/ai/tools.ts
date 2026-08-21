import "server-only";

import { AIManagerError } from "@/lib/ai/errors";
import { inclusiveDateRange } from "@/lib/ai/date-context";
import type { AIRestaurantContext, AIToolDefinition } from "@/lib/ai/types";
import { PURCHASE_ORDER_STATUSES, type PurchaseOrderStatusValue } from "@/lib/purchase-orders/policy";
import { getIngredientUsageEstimate, getInventoryStatus, getLowStockItems } from "@/lib/services/inventory";
import { listPurchaseOrders } from "@/lib/services/purchase-orders";
import { getExpectedGuests, getPeakReservationHours, getReservationSummary } from "@/lib/services/reservations";
import { compareRevenue, getDailyRevenue, getOrderSummary, getRevenue, getSalesByHour, getTopSellingItems } from "@/lib/services/sales";
import { serializeToolResult } from "@/lib/ai/serialization";
import { getReadOnlyToolActivity, getReadOnlyToolContractNames, getReadOnlyToolContracts, validateReadOnlyToolArguments } from "@/lib/ai/tool-contracts";

type ToolContext = { restaurant: AIRestaurantContext };
type ReadOnlyTool = { definition: AIToolDefinition; activity: string; validate: (value: unknown, context: ToolContext) => unknown; execute: (args: never, context: ToolContext) => Promise<unknown> };
const dateProperties = { start_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Inclusive start date in YYYY-MM-DD." }, end_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Inclusive end date in YYYY-MM-DD." } };
const schema = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object" as const, properties, required, additionalProperties: false as const });

function object(value: unknown, allowedKeys: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new AIManagerError("INVALID_TOOL", "Tool arguments must be a plain object.");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowedKeys.includes(key))) throw new AIManagerError("INVALID_TOOL", "Tool arguments contain unsupported fields.");
  return record;
}
function requiredString(record: Record<string, unknown>, key: string, maximum = 120) { const value = record[key]; if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new AIManagerError("INVALID_TOOL", `${key} is invalid.`); return value.trim(); }
function range(value: unknown, context: ToolContext) { const record = object(value, ["start_date", "end_date"]); const startDate = requiredString(record, "start_date", 10); const endDate = requiredString(record, "end_date", 10); const parsed = inclusiveDateRange(startDate, endDate, context.restaurant.timezone); if (!parsed) throw new AIManagerError("INVALID_TOOL", "Date range is invalid or exceeds 366 days."); return parsed; }
function empty(value: unknown) { return object(value, []); }
export { serializeToolResult } from "@/lib/ai/serialization";

const tools: Record<string, ReadOnlyTool> = {
  get_revenue: { definition: { name: "get_revenue", description: "Get completed-order revenue for an inclusive restaurant-local date range.", parameters: schema(dateProperties, ["start_date", "end_date"]) }, activity: "Checking sales...", validate: range, execute: (args, context) => getRevenue({ restaurantId: context.restaurant.id, ...(args as ReturnType<typeof range>) }) },
  compare_revenue: { definition: { name: "compare_revenue", description: "Compare completed-order revenue between two inclusive restaurant-local date ranges.", parameters: schema({ current_start_date: dateProperties.start_date, current_end_date: dateProperties.end_date, comparison_start_date: dateProperties.start_date, comparison_end_date: dateProperties.end_date }, ["current_start_date", "current_end_date", "comparison_start_date", "comparison_end_date"]) }, activity: "Comparing sales...", validate: (value, context) => { const record = object(value, ["current_start_date", "current_end_date", "comparison_start_date", "comparison_end_date"]); const current = range({ start_date: requiredString(record, "current_start_date", 10), end_date: requiredString(record, "current_end_date", 10) }, context); const comparison = range({ start_date: requiredString(record, "comparison_start_date", 10), end_date: requiredString(record, "comparison_end_date", 10) }, context); return { currentStart: current.start, currentEnd: current.end, comparisonStart: comparison.start, comparisonEnd: comparison.end }; }, execute: (args, context) => compareRevenue({ restaurantId: context.restaurant.id, ...(args as { currentStart: Date; currentEnd: Date; comparisonStart: Date; comparisonEnd: Date }) }) },
  get_order_summary: { definition: { name: "get_order_summary", description: "Get aggregated order counts, statuses, completed revenue, and average order value for a date range.", parameters: schema(dateProperties, ["start_date", "end_date"]) }, activity: "Reviewing orders...", validate: range, execute: (args, context) => getOrderSummary({ restaurantId: context.restaurant.id, ...(args as ReturnType<typeof range>) }) },
  get_top_selling_items: { definition: { name: "get_top_selling_items", description: "Rank completed-order menu items by revenue or quantity for a date range.", parameters: schema({ ...dateProperties, limit: { type: "integer", minimum: 1, maximum: 20 }, ranking_mode: { type: "string", enum: ["revenue", "quantity"] } }, ["start_date", "end_date", "limit", "ranking_mode"]) }, activity: "Finding top-selling dishes...", validate: (value, context) => { const record = object(value, ["start_date", "end_date", "limit", "ranking_mode"]); const dates = range(record, context); if (!Number.isInteger(record.limit) || Number(record.limit) < 1 || Number(record.limit) > 20) throw new AIManagerError("INVALID_TOOL", "limit must be between 1 and 20."); if (record.ranking_mode !== "revenue" && record.ranking_mode !== "quantity") throw new AIManagerError("INVALID_TOOL", "ranking_mode is invalid."); return { ...dates, limit: Number(record.limit), rankBy: record.ranking_mode }; }, execute: (args, context) => getTopSellingItems({ restaurantId: context.restaurant.id, ...(args as ReturnType<ReadOnlyTool["validate"]> as { start: Date; end: Date; limit: number; rankBy: "revenue" | "quantity" }) }) },
  get_sales_by_hour: { definition: { name: "get_sales_by_hour", description: "Get completed revenue and order counts by restaurant-local hour for a date range.", parameters: schema(dateProperties, ["start_date", "end_date"]) }, activity: "Checking sales by hour...", validate: range, execute: (args, context) => getSalesByHour({ restaurantId: context.restaurant.id, ...(args as ReturnType<typeof range>) }) },
  get_daily_revenue: { definition: { name: "get_daily_revenue", description: "Get completed revenue grouped by restaurant-local calendar day.", parameters: schema(dateProperties, ["start_date", "end_date"]) }, activity: "Reviewing daily performance...", validate: range, execute: (args, context) => getDailyRevenue({ restaurantId: context.restaurant.id, ...(args as ReturnType<typeof range>), timeZone: context.restaurant.timezone }) },
  get_low_stock_items: { definition: { name: "get_low_stock_items", description: "List ingredients currently at or below their reorder level.", parameters: schema({}) }, activity: "Reviewing inventory...", validate: empty, execute: (_args, context) => getLowStockItems({ restaurantId: context.restaurant.id }) },
  get_inventory_status: { definition: { name: "get_inventory_status", description: "Get aggregated inventory health and bounded ingredient stock details.", parameters: schema({}) }, activity: "Reviewing inventory...", validate: empty, execute: (_args, context) => getInventoryStatus({ restaurantId: context.restaurant.id }) },
  get_ingredient_usage: { definition: { name: "get_ingredient_usage", description: "Estimate usage of a named ingredient from completed orders and configured recipes over a date range.", parameters: schema({ ingredient_name: { type: "string", minLength: 1, maxLength: 120 }, ...dateProperties }, ["ingredient_name", "start_date", "end_date"]) }, activity: "Estimating ingredient usage...", validate: (value, context) => { const record = object(value, ["ingredient_name", "start_date", "end_date"]); return { ingredientName: requiredString(record, "ingredient_name"), ...range(record, context) }; }, execute: async (args, context) => { const input = args as { ingredientName: string; start: Date; end: Date }; const inventory = await getInventoryStatus({ restaurantId: context.restaurant.id }); const ingredient = inventory.items.find((item) => item.name.toLocaleLowerCase() === input.ingredientName.toLocaleLowerCase()); if (!ingredient) throw new AIManagerError("TOOL_FAILED", `Ingredient '${input.ingredientName}' was not found in this restaurant.`); return getIngredientUsageEstimate({ restaurantId: context.restaurant.id, ingredientId: ingredient.ingredientId, start: input.start, end: input.end }); } },
  get_reservation_summary: { definition: { name: "get_reservation_summary", description: "Get reservation counts, statuses, and expected guests for a date range.", parameters: schema(dateProperties, ["start_date", "end_date"]) }, activity: "Checking reservations...", validate: range, execute: (args, context) => getReservationSummary({ restaurantId: context.restaurant.id, ...(args as ReturnType<typeof range>) }) },
  get_expected_guests: { definition: { name: "get_expected_guests", description: "Get confirmed reservation count and expected guests for a date range.", parameters: schema(dateProperties, ["start_date", "end_date"]) }, activity: "Checking expected guests...", validate: range, execute: (args, context) => getExpectedGuests({ restaurantId: context.restaurant.id, ...(args as ReturnType<typeof range>) }) },
  get_peak_reservation_hours: { definition: { name: "get_peak_reservation_hours", description: "Get reservation demand grouped by restaurant-local hour for a date range.", parameters: schema(dateProperties, ["start_date", "end_date"]) }, activity: "Finding peak reservation hours...", validate: range, execute: (args, context) => getPeakReservationHours({ restaurantId: context.restaurant.id, ...(args as ReturnType<typeof range>) }) },
  list_purchase_orders: { definition: { name: "list_purchase_orders", description: "List recent purchase orders, optionally filtered by an approved status. This tool cannot create or modify them.", parameters: schema({ status: { type: "string", enum: PURCHASE_ORDER_STATUSES } }) }, activity: "Checking purchase orders...", validate: (value) => { const record = object(value, ["status"]); if (record.status === undefined || record.status === "") return {}; if (typeof record.status !== "string" || !PURCHASE_ORDER_STATUSES.includes(record.status as PurchaseOrderStatusValue)) throw new AIManagerError("INVALID_TOOL", "Purchase-order status is invalid."); return { status: record.status as PurchaseOrderStatusValue }; }, execute: async (args, context) => (await listPurchaseOrders({ restaurantId: context.restaurant.id, ...(args as { status?: PurchaseOrderStatusValue }) })).slice(0, 30) },
};

export function getReadOnlyToolDefinitions() { return getReadOnlyToolContracts(); }
export function getToolActivity(name: string) { return getReadOnlyToolActivity(name); }
export function getReadOnlyToolNames() { return getReadOnlyToolContractNames(); }

export async function executeReadOnlyTool(input: { name: string; arguments: unknown; context: ToolContext }) {
  const tool = tools[input.name];
  if (!tool) throw new AIManagerError("INVALID_TOOL", `Unsupported tool: ${input.name}.`);
  const started = Date.now();
  try {
    const args = validateReadOnlyToolArguments(input.name, input.arguments, input.context.restaurant);
    const result = await tool.execute(args as never, input.context);
    console.info(JSON.stringify({ event: "ai_tool_execution", toolName: input.name, restaurantId: input.context.restaurant.id, success: true, durationMs: Date.now() - started, timestamp: new Date().toISOString() }));
    return serializeToolResult(result);
  } catch (error) {
    console.info(JSON.stringify({ event: "ai_tool_execution", toolName: input.name, restaurantId: input.context.restaurant.id, success: false, durationMs: Date.now() - started, timestamp: new Date().toISOString() }));
    if (error instanceof AIManagerError) throw error;
    throw new AIManagerError("TOOL_FAILED", "The requested restaurant data could not be retrieved.");
  }
}
