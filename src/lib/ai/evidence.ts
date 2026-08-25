export type AIEvidenceLink = { label: string; href: string };

const groups: Array<{ tools: string[]; evidence: AIEvidenceLink }> = [
  { tools: ["get_restaurant_profile"], evidence: { label: "Restaurant settings", href: "/settings" } },
  { tools: ["list_menu_items", "find_menu_items", "get_menu_item_details"], evidence: { label: "Menu", href: "/menu" } },
  { tools: ["get_menu_item_recipe", "list_recipe_ingredients", "list_recipes"], evidence: { label: "Recipes", href: "/menu" } },
  { tools: ["find_ingredients", "get_ingredient_details", "list_recent_inventory_movements", "get_low_stock_items", "get_inventory_status", "get_ingredient_usage"], evidence: { label: "Inventory", href: "/inventory" } },
  { tools: ["list_suppliers", "find_suppliers", "get_supplier_details", "get_supplier_purchase_history", "find_suppliers_for_ingredient"], evidence: { label: "Suppliers", href: "/suppliers" } },
  { tools: ["list_purchase_orders", "find_purchase_orders", "get_purchase_order_details"], evidence: { label: "Purchase orders", href: "/purchase-orders" } },
  { tools: ["list_recent_orders", "find_orders", "get_order_details", "list_kitchen_orders", "get_order_summary"], evidence: { label: "Orders", href: "/orders" } },
  { tools: ["get_revenue", "compare_revenue", "get_top_selling_items", "get_sales_by_hour", "get_daily_revenue"], evidence: { label: "Sales", href: "/sales" } },
  { tools: ["get_reservation_summary", "get_expected_guests", "get_reservation_status_breakdown", "get_peak_reservation_hours", "find_reservations", "get_reservation_details", "list_upcoming_reservations"], evidence: { label: "Reservations", href: "/reservations" } },
];

const evidenceByTool = new Map(groups.flatMap(({ tools, evidence }) => tools.map((tool) => [tool, evidence] as const)));

export function getAIEvidenceLinks(tools: readonly string[]) {
  const unique = new Map<string, AIEvidenceLink>();
  for (const tool of tools) {
    const evidence = evidenceByTool.get(tool);
    if (evidence) unique.set(evidence.href, evidence);
  }
  return [...unique.values()];
}
