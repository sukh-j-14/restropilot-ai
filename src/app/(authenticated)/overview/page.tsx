import { connection } from "next/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { OverviewDashboard } from "@/components/overview-dashboard";
import { getOverviewDashboardData } from "@/lib/dashboard/get-overview-data";
import {
  ActiveOrganizationRequiredError,
  getCurrentRestaurant,
} from "@/lib/services/tenant";

function WorkspaceState({ title, description }: { title: string; description: string }) {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl items-center px-6 py-16 text-center">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      </div>
    </main>
  );
}

export default async function OverviewPage() {
  await connection();

  let restaurant;
  try {
    restaurant = await getCurrentRestaurant();
  } catch (error) {
    if (!(error instanceof ActiveOrganizationRequiredError)) throw error;
    return (
      <DashboardShell restaurantName="Select an organization" activeNavigation="overview">
        <WorkspaceState
          title="Organization required"
          description="Create or select a restaurant organization from the header to continue."
        />
      </DashboardShell>
    );
  }

  if (!restaurant) {
    redirect("/onboarding");
  }

  const data = await getOverviewDashboardData(restaurant.id);
  return (
    <DashboardShell restaurantName={restaurant.name} activeNavigation="overview">
      <OverviewDashboard data={data} />
    </DashboardShell>
  );
}


