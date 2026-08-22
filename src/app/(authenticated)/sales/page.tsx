import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { SalesAnalytics } from "@/components/sales/sales-analytics";
import { addDays } from "@/lib/dashboard/date";
import { fillDailyRevenue } from "@/lib/sales/calculations";
import { resolveSalesRange, SALES_RANGE_PRESETS } from "@/lib/sales/ranges";
import { compareRevenue, getDailyRevenue, getOrderSummary, getOrderTypeBreakdown, getSalesByHour, getTopSellingItemRankings } from "@/lib/services/sales";
import { getCurrentRestaurant } from "@/lib/services/tenant";

type Search = Promise<{ range?: string | string[]; start?: string | string[]; end?: string | string[] }>;
function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function money(value: number, currency: string) { return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(value); }
function signedPercent(value: number | null) { return value === null ? "No prior baseline" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`; }

const presetLabels: Record<string, string> = { today: "Today", yesterday: "Yesterday", last7: "Last 7 days", last30: "Last 30 days", thisMonth: "This month" };

export default async function SalesPage({ searchParams }: { searchParams: Search }) {
  await connection();
  let restaurant;
  try { restaurant = await getCurrentRestaurant(); } catch { redirect("/onboarding"); }
  if (!restaurant) redirect("/onboarding");
  const search = await searchParams;
  const range = resolveSalesRange({ timeZone: restaurant.timezone, preset: first(search.range), start: first(search.start), end: first(search.end) });
  const input = { restaurantId: restaurant.id, start: range.start, end: range.end };
  const [comparison, summary, sparseDaily, rankings, hourlySales, orderTypes] = await Promise.all([
    compareRevenue({ restaurantId: restaurant.id, currentStart: range.start, currentEnd: range.end, comparisonStart: range.comparisonStart, comparisonEnd: range.comparisonEnd }),
    getOrderSummary(input),
    getDailyRevenue({ ...input, timeZone: restaurant.timezone }),
    getTopSellingItemRankings({ ...input, limit: 10 }),
    getSalesByHour(input),
    getOrderTypeBreakdown(input),
  ]);
  const dailyRevenue = fillDailyRevenue(range.startKey, range.endKey, sparseDaily, addDays);
  const noSales = summary.totalOrders === 0;

  return <DashboardShell restaurantName={restaurant.name} activeNavigation="sales"><main className="mx-auto max-w-[1480px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 lg:py-10">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><p className="text-sm font-medium text-emerald-700">Performance analytics</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-[28px]">Sales</h1><p className="mt-1.5 text-sm text-slate-500">Revenue and order performance for {restaurant.name}.</p></div><p className="text-xs text-slate-500">Calendar days use <strong className="text-slate-700">{restaurant.timezone}</strong></p></div>

    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Sales date filters"><div className="flex flex-wrap gap-2">{SALES_RANGE_PRESETS.filter((item) => item !== "custom").map((preset) => <Link key={preset} href={`/sales?range=${preset}`} className={`rounded-lg px-3 py-2 text-xs font-semibold ${range.preset === preset && !range.error ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{presetLabels[preset]}</Link>)}</div><form method="get" className="mt-4 flex flex-wrap items-end gap-3"><input type="hidden" name="range" value="custom" /><label className="text-xs font-medium text-slate-600">From<input name="start" type="date" defaultValue={first(search.start) ?? range.startKey} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700" /></label><label className="text-xs font-medium text-slate-600">To<input name="end" type="date" defaultValue={first(search.end) ?? range.endKey} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700" /></label><button className="rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-700">Apply range</button></form>{range.error && <p className="mt-3 text-xs font-medium text-rose-600">{range.error} Showing the last 7 days instead.</p>}</section>

    <div className="mt-6 flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-800">{range.label}</p><p className="text-xs text-slate-500">Compared with {range.comparisonLabel}</p></div>
    <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Sales summary">
      <Metric label="Revenue" value={money(comparison.current.revenue, restaurant.currency)} detail={`${signedPercent(comparison.percentageChange)} vs prior period`} tone={comparison.percentageChange !== null && comparison.percentageChange < 0 ? "negative" : "positive"} />
      <Metric label="Orders" value={String(summary.totalOrders)} detail={`${summary.completedOrders} completed · ${summary.cancelledOrders} cancelled`} />
      <Metric label="Average order value" value={money(summary.averageCompletedOrderValue, restaurant.currency)} detail="Completed orders" />
      <Metric label="Revenue change" value={money(comparison.absoluteChange, restaurant.currency)} detail={`Prior: ${money(comparison.comparison.revenue, restaurant.currency)}`} tone={comparison.absoluteChange < 0 ? "negative" : "positive"} />
    </section>
    {noSales && <section className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><h2 className="text-base font-semibold text-slate-900">No sales recorded for this period.</h2><p className="mt-2 text-sm text-slate-500">Choose another range or import historical orders to populate sales analytics.</p><Link href="/imports" className="mt-4 inline-flex rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Open Data Import</Link></section>}
    <div className="mt-6"><SalesAnalytics currency={restaurant.currency} dailyRevenue={dailyRevenue} hourlySales={hourlySales} rankings={rankings} orderTypes={orderTypes} /></div>
  </main></DashboardShell>;
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: "positive" | "negative" }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p><p className={`mt-2 text-xs ${tone === "negative" ? "text-rose-600" : tone === "positive" ? "text-emerald-700" : "text-slate-500"}`}>{detail}</p></div>;
}
