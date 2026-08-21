import { Icon, type IconName } from "@/components/icons";
import type { DashboardData } from "@/lib/dashboard/get-overview-data";

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompactCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function changeLabel(change: number | null, comparison = "vs last week") {
  if (change === null) return "No comparable data";
  if (Math.abs(change) < 0.05) return `No change ${comparison}`;
  return `${change > 0 ? "+" : ""}${change.toFixed(1)}% ${comparison}`;
}

function formatQuantity(value: number) {
  return value.toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

export function OverviewDashboard({ data }: { data: DashboardData }) {
  const { currency } = data.restaurant;
  const inventory = data.attention.inventory;
  const sales = data.attention.sales;
  const friday = data.attention.reservations;
  const kpis: {
    label: string;
    value: string;
    detail: string;
    icon: IconName;
    positive?: boolean;
    warning?: boolean;
  }[] = [
    {
      label: "Today’s Revenue",
      value: formatCurrency(data.kpis.revenue.value, currency),
      detail: changeLabel(data.kpis.revenue.change),
      icon: "chart",
      positive: (data.kpis.revenue.change ?? 0) > 0,
    },
    {
      label: "Orders Today",
      value: data.kpis.orders.value.toLocaleString("en-IN"),
      detail: changeLabel(data.kpis.orders.change),
      icon: "orders",
      positive: (data.kpis.orders.change ?? 0) > 0,
    },
    {
      label: "Reservations Tonight",
      value: data.kpis.reservations.count.toLocaleString("en-IN"),
      detail: `${data.kpis.reservations.guests} guests · ${data.kpis.reservations.occupancy}% capacity`,
      icon: "calendar",
    },
    {
      label: "Inventory Alerts",
      value: data.kpis.inventoryAlerts.toLocaleString("en-IN"),
      detail: data.kpis.inventoryAlerts > 0 ? "Needs attention" : "Stock levels healthy",
      icon: "alert",
      warning: data.kpis.inventoryAlerts > 0,
    },
  ];

  const attentionItems: {
    eyebrow: string;
    title: string;
    detail: string;
    action: string;
    icon: IconName;
    tone: string;
  }[] = [
    {
      eyebrow: "Inventory status",
      title: inventory ? `${inventory.name} needs restocking` : "Inventory levels are healthy",
      detail: inventory
        ? `Current ${formatQuantity(inventory.currentStock)} ${inventory.unit} · Reorder at ${formatQuantity(inventory.reorderLevel)} ${inventory.unit}`
        : "No ingredients are currently below their reorder level.",
      action: "Review Inventory",
      icon: "inventory",
      tone: "bg-amber-50 text-amber-700",
    },
    {
      eyebrow: "Revenue insight",
      title: sales.isWarning && sales.change !== null
        ? `Dinner revenue yesterday was down ${Math.abs(sales.change).toFixed(0)}%`
        : "Dinner revenue is near its weekday baseline",
      detail: `Yesterday ${formatCurrency(sales.yesterdayRevenue, currency)} · Baseline ${formatCurrency(sales.baselineRevenue, currency)}`,
      action: "Investigate",
      icon: "sales",
      tone: sales.isWarning ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700",
    },
    {
      eyebrow: "Capacity forecast",
      title: `${friday.dateLabel} is expected to reach ${friday.occupancy}% capacity`,
      detail: `${friday.count} confirmed reservations · ${friday.guests} expected guests`,
      action: "View Reservations",
      icon: "reservations",
      tone: "bg-blue-50 text-blue-700",
    },
  ];

  const maxRevenue = Math.max(...data.performance.days.map((day) => day.revenue), 1);

  return (
    <main className="mx-auto max-w-[1480px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 lg:py-10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-700">{data.today.label}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-[28px]">Good morning</h1>
          <p className="mt-1.5 text-sm text-slate-500">Here’s what’s happening across your restaurant today.</p>
        </div>
        <span className="mt-2 inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm sm:mt-0">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Live overview
        </span>
      </div>

      <section aria-labelledby="kpi-heading" className="mt-7">
        <h2 id="kpi-heading" className="sr-only">Today’s key performance indicators</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => (
            <article key={kpi.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
              <div className="flex items-start justify-between">
                <p className="text-sm font-medium text-slate-500">{kpi.label}</p>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-slate-600"><Icon name={kpi.icon} className="h-[18px] w-[18px]" /></span>
              </div>
              <p className="mt-5 text-[27px] font-bold tracking-tight text-slate-950">{kpi.value}</p>
              <p className={`mt-1.5 text-xs font-semibold ${kpi.positive ? "text-emerald-600" : kpi.warning ? "text-amber-600" : "text-slate-500"}`}>{kpi.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="attention-heading" className="mt-9">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="attention-heading" className="text-lg font-bold tracking-tight text-slate-900">Needs Your Attention</h2>
            <p className="mt-1 text-sm text-slate-500">Priority insights that may need a decision today.</p>
          </div>
          <span className="hidden rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 sm:inline">3 updates</span>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          {attentionItems.map((item) => (
            <article key={item.eyebrow} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.tone}`}><Icon name={item.icon} className="h-5 w-5" /></div>
              <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">{item.eyebrow}</p>
              <h3 className="mt-1.5 text-[15px] font-semibold leading-6 text-slate-900">{item.title}</h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">{item.detail}</p>
              <button type="button" className="mt-5 flex w-fit items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800">
                {item.action}<Icon name="chevron" className="h-3.5 w-3.5" />
              </button>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="performance-heading" className="mt-9 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="performance-heading" className="text-lg font-bold tracking-tight text-slate-900">Recent Performance</h2>
            <p className="mt-1 text-sm text-slate-500">Completed-order revenue over the last 7 days</p>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight">{formatCompactCurrency(data.performance.total, currency)}</span>
            <span className={`text-xs font-semibold ${(data.performance.change ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{changeLabel(data.performance.change, "vs prior 7 days")}</span>
          </div>
        </div>
        <div className="mt-7 flex h-52 items-end gap-2 border-b border-slate-200 px-1 sm:gap-3" aria-label="Daily completed-order revenue for the last seven days">
          {data.performance.days.map((day) => (
            <div key={day.key} className="group relative flex h-full flex-1 items-end" title={`${day.label}: ${formatCurrency(day.revenue, currency)}`}>
              <div className="w-full rounded-t bg-emerald-600/15 transition-colors group-hover:bg-emerald-600/25" style={{ height: `${(day.revenue / maxRevenue) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-7 text-center text-[10px] font-medium text-slate-400">
          {data.performance.days.map((day) => <span key={day.key}>{day.label}</span>)}
        </div>
      </section>
    </main>
  );
}
