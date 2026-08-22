import { connection } from "next/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { OnboardingForm } from "@/components/onboarding-form";
import {
  ActiveOrganizationRequiredError,
  getCurrentRestaurant,
} from "@/lib/services/tenant";

export default async function OnboardingPage() {
  await connection();

  let restaurant;
  try {
    restaurant = await getCurrentRestaurant();
  } catch (error) {
    if (!(error instanceof ActiveOrganizationRequiredError)) throw error;
    return (
      <DashboardShell restaurantName="Select an organization">
        <main className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl items-center px-6 py-16 text-center">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">Organization required</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Create or select a restaurant organization from the header before continuing setup.
            </p>
          </div>
        </main>
      </DashboardShell>
    );
  }

  if (restaurant) redirect("/overview");

  return (
    <DashboardShell restaurantName="New restaurant setup">
      <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 lg:py-14">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold text-emerald-700">Workspace setup</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Tell us about your restaurant</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            These details set your operating timezone, reporting currency, and reservation capacity. You can update them later.
          </p>
          <OnboardingForm />
        </div>
      </main>
    </DashboardShell>
  );
}
