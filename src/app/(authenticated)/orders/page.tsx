import { connection } from "next/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { OrderManager } from "@/components/orders/order-manager";
import { validateOrderStatus, validateOrderType } from "@/lib/orders/policy";
import { listActiveMenuItemsForOrders, listKitchenOrders, listOrders } from "@/lib/services/orders";
import { getCurrentRestaurant } from "@/lib/services/tenant";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; type?: string }> }) {
  await connection();
  let restaurant;
  try { restaurant = await getCurrentRestaurant(); } catch { redirect("/onboarding"); }
  if (!restaurant) redirect("/onboarding");
  const query = await searchParams;
  const status = query.status ? validateOrderStatus(query.status) ?? undefined : undefined;
  const orderType = query.type ? validateOrderType(query.type) ?? undefined : undefined;
  const [orders, kitchenOrders, menuItems] = await Promise.all([
    listOrders({ restaurantId: restaurant.id, status, orderType }),
    listKitchenOrders({ restaurantId: restaurant.id }),
    listActiveMenuItemsForOrders({ restaurantId: restaurant.id }),
  ]);
  return <DashboardShell restaurantName={restaurant.name} activeNavigation="orders"><main className="mx-auto max-w-[1480px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 lg:py-10"><p className="text-sm font-medium text-emerald-700">Restaurant operations</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-[28px]">Orders &amp; kitchen</h1><p className="mt-1.5 text-sm text-slate-500">Create internal orders, manage kitchen progress, and consume recipe inventory accurately.</p><div className="mt-7"><OrderManager orders={orders} kitchenOrders={kitchenOrders} menuItems={menuItems} currency={restaurant.currency} activeStatus={status} activeType={orderType} /></div></main></DashboardShell>;
}
