import { connection } from "next/server";
import { redirect } from "next/navigation";
import { SupplierManager } from "@/components/catalog/supplier-manager";
import { DashboardShell } from "@/components/dashboard-shell";
import { listSuppliers } from "@/lib/services/suppliers";
import { getCurrentRestaurant } from "@/lib/services/tenant";

export default async function SuppliersPage() {
  await connection();
  let restaurant;
  try { restaurant = await getCurrentRestaurant(); } catch { redirect("/onboarding"); }
  if (!restaurant) redirect("/onboarding");
  const suppliers = await listSuppliers({ restaurantId: restaurant.id });
  return <DashboardShell restaurantName={restaurant.name} activeNavigation="suppliers"><main className="mx-auto max-w-[1480px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 lg:py-10"><p className="text-sm font-medium text-emerald-700">Procurement</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-[28px]">Suppliers</h1><p className="mt-1.5 text-sm text-slate-500">Manage vendor contact information for this restaurant.</p><div className="mt-7"><SupplierManager suppliers={suppliers} /></div></main></DashboardShell>;
}
