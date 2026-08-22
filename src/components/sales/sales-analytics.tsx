"use client";

import { useState } from "react";

type RankedItem = { rank: number; menuItemId: string; name: string; category: string; quantity: number; revenue: number };
type Props = {
  currency: string;
  dailyRevenue: Array<{ date: string; revenue: number }>;
  hourlySales: Array<{ hour: number; revenue: number; orderCount: number }>;
  rankings: { byRevenue: RankedItem[]; byQuantity: RankedItem[] };
  orderTypes: Array<{ orderType: string; orderCount: number; revenue: number; revenueShare: number; orderShare: number }>;
};

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function typeLabel(value: string) {
  return value === "DINE_IN" ? "Dine-in" : value.charAt(0) + value.slice(1).toLowerCase();
}

export function SalesAnalytics({ currency, dailyRevenue, hourlySales, rankings, orderTypes }: Props) {
  const [rankBy, setRankBy] = useState<"revenue" | "quantity">("revenue");
  const items = rankBy === "revenue" ? rankings.byRevenue : rankings.byQuantity;
  const maxDaily = Math.max(0, ...dailyRevenue.map((item) => item.revenue));
  const maxHourly = Math.max(0, ...hourlySales.map((item) => item.revenue));
  const hasDailySales = maxDaily > 0;
  const hasHourlySales = maxHourly > 0;

  return <div className="grid gap-6 xl:grid-cols-2">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2" aria-labelledby="revenue-trend-title">
      <div className="flex items-start justify-between gap-4"><div><h2 id="revenue-trend-title" className="text-base font-semibold text-slate-900">Daily revenue trend</h2><p className="mt-1 text-xs text-slate-500">Completed-order revenue in restaurant-local calendar days.</p></div>{hasDailySales && <p className="text-xs font-medium text-slate-500">Peak {money(maxDaily, currency)}</p>}</div>
      {!hasDailySales ? <EmptyChart /> : <div className="mt-6 overflow-x-auto pb-1"><div className="flex h-56 min-w-full items-end gap-2 border-b border-slate-200" style={{ width: Math.max(680, dailyRevenue.length * 34) }}>
        {dailyRevenue.map((item) => <div key={item.date} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={`${shortDate(item.date)}: ${money(item.revenue, currency)}`}>
          <div className="mb-2 hidden max-w-24 truncate text-[10px] font-medium text-slate-600 group-hover:block">{money(item.revenue, currency)}</div>
          <div className="w-full max-w-8 rounded-t bg-emerald-600 transition-colors group-hover:bg-emerald-700" style={{ height: `${item.revenue ? Math.max(4, item.revenue / maxDaily * 100) : 0}%` }} aria-label={`${shortDate(item.date)} revenue ${money(item.revenue, currency)}`} />
          <span className="mt-2 whitespace-nowrap text-[10px] text-slate-400">{shortDate(item.date)}</span>
        </div>)}
      </div></div>}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="top-items-title">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="top-items-title" className="text-base font-semibold text-slate-900">Top-selling items</h2><p className="mt-1 text-xs text-slate-500">Completed order items only.</p></div><div className="flex rounded-lg bg-slate-100 p-1" aria-label="Ranking mode">{(["revenue", "quantity"] as const).map((mode) => <button key={mode} type="button" onClick={() => setRankBy(mode)} className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize ${rankBy === mode ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{mode}</button>)}</div></div>
      {items.length === 0 ? <EmptyChart /> : <ol className="mt-5 divide-y divide-slate-100">{items.map((item) => <li key={item.menuItemId} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 py-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">{item.rank}</span><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{item.name}</p><p className="text-xs text-slate-400">{item.category} · {item.quantity} sold</p></div><p className="text-sm font-semibold text-slate-800">{money(item.revenue, currency)}</p></li>)}</ol>}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="hourly-title">
      <h2 id="hourly-title" className="text-base font-semibold text-slate-900">Sales by hour</h2><p className="mt-1 text-xs text-slate-500">Restaurant-local time; completed orders only.</p>
      {!hasHourlySales ? <EmptyChart /> : <div className="mt-6 flex h-52 items-end gap-1.5 border-b border-slate-200">{hourlySales.map((item) => <div key={item.hour} className="group flex h-full flex-1 flex-col items-center justify-end" title={`${String(item.hour).padStart(2, "0")}:00 · ${item.orderCount} orders · ${money(item.revenue, currency)}`}><div className="w-full rounded-t bg-sky-500 group-hover:bg-sky-600" style={{ height: `${item.revenue ? Math.max(4, item.revenue / maxHourly * 100) : 0}%` }} /><span className="mt-2 text-[9px] text-slate-400">{item.hour % 3 === 0 ? String(item.hour).padStart(2, "0") : ""}</span></div>)}</div>}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2" aria-labelledby="order-types-title"><h2 id="order-types-title" className="text-base font-semibold text-slate-900">Order type mix</h2><p className="mt-1 text-xs text-slate-500">Share of completed-order revenue.</p><div className="mt-5 grid gap-4 sm:grid-cols-3">{orderTypes.map((item) => <div key={item.orderType} className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-800">{typeLabel(item.orderType)}</p><p className="text-xs font-semibold text-slate-500">{item.revenueShare.toFixed(0)}%</p></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${item.revenueShare}%` }} /></div><div className="mt-3 flex justify-between text-xs text-slate-500"><span>{item.orderCount} orders</span><span>{money(item.revenue, currency)}</span></div></div>)}</div></section>
  </div>;
}

function EmptyChart() {
  return <div className="mt-5 flex min-h-32 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center text-sm text-slate-500">No sales recorded for this period.</div>;
}
