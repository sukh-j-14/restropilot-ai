import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { RestaurantSettingsForm } from "@/components/settings/restaurant-settings-form";
import { getCurrentRestaurant } from "@/lib/services/tenant";
import { canManageRestaurantSettings } from "@/lib/settings/authorization";

export default async function SettingsPage() {
  await connection();
  let restaurant;
  try { restaurant = await getCurrentRestaurant(); } catch { redirect("/onboarding"); }
  if (!restaurant) redirect("/onboarding");
  const session = await auth();
  const canEdit = canManageRestaurantSettings(session.orgRole);
  return <DashboardShell restaurantName={restaurant.name} activeNavigation="settings"><main className="mx-auto max-w-4xl px-4 py-7 sm:px-6 sm:py-9 lg:px-8 lg:py-10"><p className="text-sm font-medium text-emerald-700">Workspace configuration</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-[28px]">Restaurant settings</h1><p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">Manage the operating details used throughout reporting, reservations, capacity planning, and monetary displays.</p><div className="mt-7"><RestaurantSettingsForm restaurant={restaurant} canEdit={canEdit} /></div></main></DashboardShell>;
}
