import { connection } from "next/server";
import { redirect } from "next/navigation";
import { InventoryManager } from "@/components/catalog/inventory-manager";
import { DashboardShell } from "@/components/dashboard-shell";
import { getInventoryStatus } from "@/lib/services/inventory";
import { getCurrentRestaurant } from "@/lib/services/tenant";

export default async function InventoryPage() {
  await connection();
  let restaurant;
  try {
    restaurant = await getCurrentRestaurant();
  } catch {
    redirect("/onboarding");
  }
  if (!restaurant) redirect("/onboarding");
  const inventory = await getInventoryStatus({ restaurantId: restaurant.id });

  return (
    <DashboardShell restaurantName={restaurant.name} activeNavigation="inventory">
      <main className="mx-auto max-w-[1480px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 lg:py-10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-sm font-medium text-emerald-700">Operations</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-[28px]">Inventory management</h1><p className="mt-1.5 text-sm text-slate-500">Track ingredient stock, reorder thresholds, and unit costs.</p></div>
          <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-semibold ${inventory.lowStockCount ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{inventory.lowStockCount} low-stock {inventory.lowStockCount === 1 ? "item" : "items"}</span>
        </div>
        <div className="mt-7"><InventoryManager items={inventory.items} currency={restaurant.currency} /></div>
      </main>
    </DashboardShell>
  );
}
