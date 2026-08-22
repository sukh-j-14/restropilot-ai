"use client";

import Link from "next/link";
import { useState } from "react";
import { calculatePricing, PRODUCT_PRICING, type BillingDuration } from "@/lib/marketing/pricing";

const durations = Object.keys(PRODUCT_PRICING.durations) as BillingDuration[];

export function PricingCard({ signedIn }: { signedIn: boolean }) {
  const [duration, setDuration] = useState<BillingDuration>("monthly");
  const price = calculatePricing(duration);
  const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: PRODUCT_PRICING.currency, maximumFractionDigits: 0 });
  return <div className="mx-auto max-w-3xl rounded-[2rem] border border-slate-200 bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-8">
    <div role="radiogroup" aria-label="Billing duration" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">{durations.map((value) => <button key={value} type="button" role="radio" aria-checked={duration === value} onClick={() => setDuration(value)} className={`rounded-lg px-2 py-2.5 text-xs font-bold transition sm:text-sm ${duration === value ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{PRODUCT_PRICING.durations[value].label}</button>)}</div>
    <div className="mt-8 grid gap-8 sm:grid-cols-[1fr_auto] sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">RestroPilot workspace</p><div className="mt-3 flex items-baseline gap-2"><span className="text-4xl font-bold tracking-tight text-slate-950">{currency.format(price.effectiveMonthly)}</span><span className="text-sm text-slate-500">/ month</span></div><p className="mt-2 text-sm text-slate-500">{currency.format(price.total)} billed for {price.label.toLowerCase()}. Pricing is presentational; checkout is not enabled.</p>{price.discountPercent > 0 && <p className="mt-2 text-sm font-semibold text-emerald-700">Save {price.discountPercent}% compared with monthly billing.</p>}</div><Link href={signedIn ? "/overview" : "/sign-up"} className="inline-flex justify-center rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-800">{signedIn ? "Open dashboard" : "Get started"}</Link></div>
    <ul className="mt-8 grid gap-3 border-t border-slate-100 pt-6 text-sm text-slate-600 sm:grid-cols-2"><li>✓ Complete operations workspace</li><li>✓ Restaurant analytics</li><li>✓ Tenant-grounded AI Manager</li><li>✓ Human-approved PO drafts</li></ul>
  </div>;
}
