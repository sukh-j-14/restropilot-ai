import { connection } from "next/server";
import { redirect } from "next/navigation";
import { MenuManager } from "@/components/catalog/menu-manager";
import { DashboardShell } from "@/components/dashboard-shell";
import { listMenuItems } from "@/lib/services/menu";
import { getInventoryStatus } from "@/lib/services/inventory";
import { listRecipes } from "@/lib/services/recipes";
import { getCurrentRestaurant } from "@/lib/services/tenant";

export default async function MenuPage() {
  await connection();
  let restaurant;
  try {
    restaurant = await getCurrentRestaurant();
  } catch {
    redirect("/onboarding");
  }
  if (!restaurant) redirect("/onboarding");
  const [items, inventory, recipes] = await Promise.all([
    listMenuItems({ restaurantId: restaurant.id }),
    getInventoryStatus({ restaurantId: restaurant.id }),
    listRecipes({ restaurantId: restaurant.id }),
  ]);
  const ingredients = inventory.items.map((item) => ({ id: item.ingredientId, name: item.name, unit: item.unit }));

  return (
    <DashboardShell restaurantName={restaurant.name} activeNavigation="menu">
      <main className="mx-auto max-w-[1480px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 lg:py-10">
        <p className="text-sm font-medium text-emerald-700">Catalog</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-[28px]">Menu management</h1>
        <p className="mt-1.5 text-sm text-slate-500">Manage pricing, categories, and item availability for this restaurant.</p>
        <div className="mt-7"><MenuManager items={items} currency={restaurant.currency} ingredients={ingredients} recipes={recipes} /></div>
      </main>
    </DashboardShell>
  );
}
