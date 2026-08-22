"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ConfirmButton } from "@/components/ui/confirm-action";
import type { AIActionProposal } from "@/lib/ai/action-proposal-types";
import { approvePurchaseOrderProposalAction, rejectActionProposalAction } from "@/lib/ai/proposal-actions";

export function PurchaseOrderProposalCard({ proposal, currency }: { proposal: AIActionProposal; currency: string }) {
  const [quantities, setQuantities] = useState(proposal.display.items.map((item) => String(item.quantity)));
  const [unitCosts, setUnitCosts] = useState(proposal.display.items.map((item) => String(item.unitCost)));
  const [expectedAt, setExpectedAt] = useState(proposal.payload.expectedAt ?? "");
  const [result, setResult] = useState<{ success: boolean; message: string; purchaseOrderId?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const total = quantities.reduce((sum, quantity, index) => sum + (Number(quantity) || 0) * (Number(unitCosts[index]) || 0), 0);

  return <section className="mt-3 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm" aria-label="Purchase order proposal">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Proposed action · approval required</p><h3 className="mt-1 font-bold text-slate-900">{proposal.title}</h3></div><span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800">PENDING</span></div>
    <p className="mt-2 text-sm leading-6 text-slate-600">{proposal.explanation}</p>
    <div className="mt-4 flex justify-between border-b border-slate-100 pb-2 text-sm"><span className="text-slate-500">Supplier</span><strong>{proposal.display.supplierName}</strong></div>
    <div className="mt-3 space-y-3">{proposal.display.items.map((item, index) => <div key={item.ingredientName} className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_110px_120px]"><div><p className="text-sm font-semibold">{item.ingredientName}</p><p className="text-xs text-slate-500">Unit: {item.unit}</p></div><label className="text-xs text-slate-500">Quantity<input aria-label={`${item.ingredientName} quantity`} value={quantities[index]} onChange={(event) => setQuantities((values) => values.map((value, i) => i === index ? event.target.value : value))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" /></label><label className="text-xs text-slate-500">Unit cost<input aria-label={`${item.ingredientName} unit cost`} value={unitCosts[index]} onChange={(event) => setUnitCosts((values) => values.map((value, i) => i === index ? event.target.value : value))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" /></label></div>)}</div>
    <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs text-slate-500">Expected date (optional)<input type="date" value={expectedAt} onChange={(event) => setExpectedAt(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label><div className="self-end text-right"><p className="text-xs text-slate-500">Server recalculates total</p><p className="text-lg font-bold">{currency} {total.toFixed(2)}</p></div></div>
    {result && <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-sm ${result.success ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{result.message}{result.purchaseOrderId && <> <Link className="font-bold underline" href="/purchase-orders">View Purchase Order</Link></>}</p>}
    {!result?.success && <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={pending} onClick={() => startTransition(async () => setResult(await approvePurchaseOrderProposalAction({ proposalId: proposal.proposalId, quantities, unitCosts, expectedAt })))} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{pending ? "Working…" : "Approve & Create Draft"}</button><ConfirmButton pending={pending} label="Reject" confirmLabel="Reject proposal" message="Reject this proposal? No purchase order will be created." onConfirm={() => startTransition(async () => setResult(await rejectActionProposalAction(proposal.proposalId)))} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold" /></div>}
  </section>;
}
