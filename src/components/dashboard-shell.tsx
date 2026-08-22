import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { HeaderControlsServer } from "@/components/header/header-controls-server";

const navigation: { key: string; label: string; icon: IconName; href: string }[] = [
  { key: "overview", label: "Overview", icon: "overview", href: "/overview" },
  { key: "ai", label: "AI Manager", icon: "sparkles", href: "/ai-manager" },
  { key: "sales", label: "Sales", icon: "sales", href: "/sales" },
  { key: "orders", label: "Orders", icon: "orders", href: "/orders" },
  { key: "menu", label: "Menu", icon: "menu", href: "/menu" },
  { key: "inventory", label: "Inventory", icon: "inventory", href: "/inventory" },
  { key: "suppliers", label: "Suppliers", icon: "suppliers", href: "/suppliers" },
  { key: "purchase-orders", label: "Purchase Orders", icon: "orders", href: "/purchase-orders" },
  { key: "imports", label: "Data Import", icon: "imports", href: "/imports" },
  { key: "reservations", label: "Reservations", icon: "reservations", href: "/reservations" },
  { key: "settings", label: "Settings", icon: "settings", href: "/settings" },
];

export function DashboardShell({ children, restaurantName, activeNavigation }: { children: ReactNode; restaurantName: string; activeNavigation?: string }) {
  return (
    <div className="min-h-screen bg-[#f6f7f8] text-slate-950 lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="border-b border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:left-0 lg:w-[248px] lg:border-r lg:border-b-0">
        <div className="flex h-16 items-center px-5 lg:h-20 lg:px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-700 text-white shadow-sm">
            <Icon name="sparkles" className="h-5 w-5" />
          </div>
          <div className="ml-3">
            <p className="text-[15px] font-bold tracking-tight">RestroPilot AI</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Operations OS</p>
          </div>
        </div>

        <nav aria-label="Primary navigation" className="overflow-x-auto px-3 pb-3 lg:mt-5 lg:overflow-visible lg:px-4">
          <ul className="flex min-w-max gap-1 lg:min-w-0 lg:flex-col lg:gap-1.5">
            {navigation.map((item) => (
              <li key={item.label}>
                <Link href={item.href} aria-current={item.key === activeNavigation ? "page" : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${item.key === activeNavigation ? "bg-emerald-50 text-emerald-800" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>
                  <Icon name={item.icon} className="h-[18px] w-[18px] shrink-0" />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="absolute inset-x-4 bottom-5 hidden rounded-xl border border-slate-200 bg-slate-50 p-3.5 lg:block">
          <p className="text-xs font-semibold text-slate-700">Organization-scoped workspace</p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Tenant context secured by Clerk</p>
        </div>
      </aside>

      <div className="min-w-0 lg:col-start-2">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 lg:h-20 lg:px-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Current restaurant</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-800 sm:text-base">{restaurantName}</p>
          </div>
          <HeaderControlsServer />
        </header>
        {children}
      </div>
    </div>
  );
}
