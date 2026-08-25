"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { AIActionCard } from "@/components/ai/ai-action-card";
import { ConfirmButton } from "@/components/ui/confirm-action";
import type { PurchaseOrderAIActionProposal } from "@/lib/ai/action-proposal-types";
import type { ProposalLifecycleStatus } from "@/lib/ai/action-lifecycle";
import { approvePurchaseOrderProposalAction, rejectActionProposalAction, type ProposalActionResult } from "@/lib/ai/proposal-actions";

export function PurchaseOrderProposalCard({ proposal, currency }: { proposal: PurchaseOrderAIActionProposal; currency: string }) {
  const [quantities, setQuantities] = useState(proposal.display.items.map((item) => String(item.quantity)));
  const [unitCosts, setUnitCosts] = useState(proposal.display.items.map((item) => String(item.unitCost)));
  const [expectedAt, setExpectedAt] = useState(proposal.payload.expectedAt ?? "");
  const [result, setResult] = useState<ProposalActionResult | null>(null);
  const [status, setStatus] = useState<ProposalLifecycleStatus>(proposal.status);
  const [pending, startTransition] = useTransition();
  const total = quantities.reduce((sum, quantity, index) => sum + (Number(quantity) || 0) * (Number(unitCosts[index]) || 0), 0);
  const recordResult = (value: ProposalActionResult) => { setResult(value); if (value.success) setStatus(value.status); };
  const actions = <><button type="button" disabled={pending} onClick={() => startTransition(async () => recordResult(await approvePurchaseOrderProposalAction({ proposalId: proposal.proposalId, quantities, unitCosts, expectedAt })))} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{pending ? "Working…" : "Approve & Create Draft"}</button><ConfirmButton pending={pending} label="Reject" confirmLabel="Reject proposal" message="Reject this proposal? No purchase order will be created." onConfirm={() => startTransition(async () => recordResult(await rejectActionProposalAction(proposal.proposalId)))} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold" /></>;
  const detail = result?.success && result.purchaseOrderId ? <> <Link className="font-bold underline" href="/purchase-orders">View Purchase Order</Link></> : null;
  return <AIActionCard proposal={proposal} status={status} result={result ? { success: result.success, message: result.message, detail } : null} actions={actions}>
    <div className="mt-4 flex justify-between border-b border-slate-100 pb-2 text-sm"><span className="text-slate-500">Supplier</span><strong>{proposal.display.supplierName}</strong></div>
    <div className="mt-3 space-y-3">{proposal.display.items.map((item, index) => <div key={item.ingredientName} className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_110px_120px]"><div><p className="text-sm font-semibold">{item.ingredientName}</p><p className="text-xs text-slate-500">Unit: {item.unit}</p></div><label className="text-xs text-slate-500">Quantity<input aria-label={`${item.ingredientName} quantity`} value={quantities[index]} onChange={(event) => setQuantities((values) => values.map((value, i) => i === index ? event.target.value : value))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" /></label><label className="text-xs text-slate-500">Unit cost<input aria-label={`${item.ingredientName} unit cost`} value={unitCosts[index]} onChange={(event) => setUnitCosts((values) => values.map((value, i) => i === index ? event.target.value : value))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" /></label></div>)}</div>
    <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs text-slate-500">Expected date (optional)<input type="date" value={expectedAt} onChange={(event) => setExpectedAt(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label><div className="self-end text-right"><p className="text-xs text-slate-500">Server recalculates total</p><p className="text-lg font-bold">{currency} {total.toFixed(2)}</p></div></div>
  </AIActionCard>;
}
