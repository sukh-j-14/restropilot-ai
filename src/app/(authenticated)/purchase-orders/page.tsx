import { connection } from "next/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { PurchaseOrderManager } from "@/components/purchase-orders/purchase-order-manager";
import { validatePurchaseOrderStatus } from "@/lib/purchase-orders/validation";
import { getInventoryStatus } from "@/lib/services/inventory";
import { listPurchaseOrders } from "@/lib/services/purchase-orders";
import { listSuppliers } from "@/lib/services/suppliers";
import { getCurrentRestaurant } from "@/lib/services/tenant";

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await connection();
  let restaurant;
  try { restaurant = await getCurrentRestaurant(); } catch { redirect("/onboarding"); }
  if (!restaurant) redirect("/onboarding");
  const requestedStatus = (await searchParams).status;
  const status = requestedStatus ? validatePurchaseOrderStatus(requestedStatus) ?? undefined : undefined;
  const [orders, suppliers, inventory] = await Promise.all([
    listPurchaseOrders({ restaurantId: restaurant.id, status }),
    listSuppliers({ restaurantId: restaurant.id }),
    getInventoryStatus({ restaurantId: restaurant.id }),
  ]);
  const ingredients = inventory.items.map((item) => ({ id: item.ingredientId, name: item.name, unit: item.unit, costPerUnit: item.costPerUnit }));
  return <DashboardShell restaurantName={restaurant.name} activeNavigation="purchase-orders"><main className="mx-auto max-w-[1480px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 lg:py-10"><p className="text-sm font-medium text-emerald-700">Procurement</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-[28px]">Purchase orders</h1><p className="mt-1.5 text-sm text-slate-500">Create supplier orders, track their lifecycle, and receive stock into inventory.</p><div className="mt-7"><PurchaseOrderManager orders={orders} suppliers={suppliers} ingredients={ingredients} currency={restaurant.currency} activeStatus={status} /></div></main></DashboardShell>;
}
