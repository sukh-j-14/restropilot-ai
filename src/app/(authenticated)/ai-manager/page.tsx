import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AIManagerWorkspace } from "@/components/ai/ai-manager-workspace";
import { DashboardShell } from "@/components/dashboard-shell";
import { getCurrentRestaurant } from "@/lib/services/tenant";

export default async function AIManagerPage() { await connection(); let restaurant; try { restaurant = await getCurrentRestaurant(); } catch { redirect("/onboarding"); } if (!restaurant) redirect("/onboarding"); return <DashboardShell restaurantName={restaurant.name} activeNavigation="ai"><main className="mx-auto max-w-[1480px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 lg:py-10"><p className="text-sm font-medium text-emerald-700">Decision support</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-[28px]">AI Manager</h1><p className="mt-1.5 max-w-3xl text-sm text-slate-500">Ask operational questions and get tenant-safe answers grounded in approved read-only restaurant data.</p><div className="mt-7"><AIManagerWorkspace restaurantName={restaurant.name} /></div></main></DashboardShell>; }
