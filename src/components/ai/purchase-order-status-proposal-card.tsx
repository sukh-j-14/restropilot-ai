"use client";

import { useState, useTransition } from "react";
import { AIActionCard } from "@/components/ai/ai-action-card";
import { ConfirmButton } from "@/components/ui/confirm-action";
import type { PurchaseOrderStatusAIActionProposal } from "@/lib/ai/action-proposal-types";
import type { ProposalLifecycleStatus } from "@/lib/ai/action-lifecycle";
import { approveAIActionProposalAction, rejectAIActionProposalAction, type ProposalActionResult } from "@/lib/ai/proposal-actions";

export function PurchaseOrderStatusProposalCard({ proposal, currency }: { proposal: PurchaseOrderStatusAIActionProposal; currency: string }) {
  const [status, setStatus] = useState<ProposalLifecycleStatus>(proposal.status); const [result, setResult] = useState<ProposalActionResult | null>(null); const [pending, startTransition] = useTransition();
  const receive = proposal.display.inventoryImpact; const cancel = proposal.display.proposedStatus === "CANCELLED";
  const act = (operation: "approve" | "reject") => startTransition(async () => { const value = operation === "approve" ? await approveAIActionProposalAction({ proposalId: proposal.proposalId }) : await rejectAIActionProposalAction(proposal.proposalId); setResult(value); if (value.success) setStatus(value.status); });
  const money = new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(proposal.display.totalAmount);
  return <AIActionCard proposal={proposal} status={status} result={result} actions={<><button type="button" disabled={pending} onClick={() => act("approve")} className={`rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${cancel ? "bg-rose-700" : "bg-emerald-700"}`}>{pending ? "Working…" : receive ? "Approve & receive" : cancel ? "Approve cancellation" : "Approve change"}</button><ConfirmButton pending={pending} label="Reject" confirmLabel="Reject proposal" message="Reject this purchase-order status proposal?" onConfirm={() => act("reject")} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold" /></>}>
    <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold text-slate-900">{proposal.display.reference}</p><p className="text-slate-600">{proposal.display.supplierName}</p></div><p className="font-bold text-slate-900">{money}</p></div><p className="mt-3 font-semibold"><span className="text-slate-500">{proposal.display.currentStatus.replaceAll("_", " ")}</span> → {proposal.display.proposedStatus.replaceAll("_", " ")}</p><ul className="mt-3 space-y-1 text-slate-700">{proposal.display.items.map((item) => <li key={item.ingredientName}>{item.ingredientName}: {item.quantity} {item.unit}</li>)}</ul>{receive ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-900">Approving this action will increase current inventory and record purchase-order receipt movements.</p> : cancel ? <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">This cancels the purchase order. Inventory will not be increased.</p> : null}</div>
  </AIActionCard>;
}
