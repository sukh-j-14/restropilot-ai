import { connection } from "next/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { ImportManager } from "@/components/imports/import-manager";
import { listImportBatches } from "@/lib/services/imports";
import { getCurrentRestaurant } from "@/lib/services/tenant";

export default async function ImportsPage() {
  await connection();
  let restaurant;
  try { restaurant = await getCurrentRestaurant(); } catch { redirect("/onboarding"); }
  if (!restaurant) redirect("/onboarding");
  const batches = await listImportBatches({ restaurantId: restaurant.id });
  return <DashboardShell restaurantName={restaurant.name} activeNavigation="imports"><main className="mx-auto max-w-[1480px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 lg:py-10"><p className="text-sm font-medium text-emerald-700">Data operations</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-[28px]">Data Import</h1><p className="mt-1.5 max-w-3xl text-sm text-slate-500">Inspect flexible restaurant CSV files, review deterministic mappings, validate normalized records, and explicitly confirm before anything reaches PostgreSQL.</p><div className="mt-7"><ImportManager batches={batches} /></div></main></DashboardShell>;
}
