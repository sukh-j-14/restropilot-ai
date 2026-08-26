"use client";
import { useTransition } from "react";
import { AIActionCard } from "@/components/ai/ai-action-card";
import { useProposalState } from "@/components/ai/proposal-state-provider";
import { ConfirmButton } from "@/components/ui/confirm-action";
import type { OrderAIActionProposal } from "@/lib/ai/action-proposal-types";
import { approveAIActionProposalAction, rejectAIActionProposalAction } from "@/lib/ai/proposal-actions";

export function OrderProposalCard({ proposal, currency }: { proposal: OrderAIActionProposal; currency: string }) {
  const { status, result, recordResult } = useProposalState(proposal); const [pending, startTransition] = useTransition();
  const target = proposal.display.proposedStatus; const warning = target === "CANCELLED" || target === "PREPARING";
  const act = (operation: "approve" | "reject") => startTransition(async () => recordResult(operation === "approve" ? await approveAIActionProposalAction({ proposalId: proposal.proposalId }) : await rejectAIActionProposalAction(proposal.proposalId)));
  const formatter = new Intl.NumberFormat("en-IN", { style: "currency", currency });
  const label = proposal.type === "CREATE_ORDER" ? "Approve & create" : target === "PREPARING" ? "Approve & start preparing" : "Approve change";
  return <AIActionCard proposal={proposal} status={status} result={result} actions={<><button type="button" disabled={pending} onClick={() => act("approve")} className={`rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${warning ? "bg-amber-700" : "bg-emerald-700"}`}>{pending ? "Working…" : label}</button><ConfirmButton pending={pending} label="Reject" confirmLabel="Reject proposal" message="Reject this proposed order action?" onConfirm={() => act("reject")} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold" /></>}>
    <div className={`mt-4 rounded-xl p-3 ${warning ? "bg-amber-50" : "bg-slate-50"}`}><p className="font-semibold text-slate-900">{proposal.display.orderNumber ?? "New order"} · {proposal.display.orderType?.replaceAll("_", " ")}</p>{proposal.type === "CREATE_ORDER" && <p className="mt-1 text-xs text-slate-500">Reference: assigned after approval</p>}{proposal.display.items.length > 0 && <ul className="mt-2 space-y-1 text-sm text-slate-700">{proposal.display.items.map((item) => <li key={item.menuItemName}>{item.quantity} × {item.menuItemName} <span className="text-slate-500">({formatter.format(item.totalPrice)})</span></li>)}</ul>}<dl className="mt-3 space-y-2">{proposal.display.changes.map((item) => <div key={item.label} className="grid gap-1 text-sm sm:grid-cols-[100px_1fr]"><dt className="text-slate-500">{item.label}</dt><dd className="font-medium text-slate-800">{item.current}{item.current && item.proposed ? " → " : ""}{item.proposed}</dd></div>)}</dl>{proposal.display.total !== undefined && <p className="mt-3 font-bold text-slate-900">Total: {formatter.format(proposal.display.total)}</p>}{target === "PREPARING" && <p className="mt-3 text-sm font-semibold text-amber-800">Starting preparation consumes recipe inventory exactly once.</p>}{target === "CANCELLED" && proposal.payload.snapshot.inventoryConsumedAt && <p className="mt-3 text-sm text-amber-800">Previously consumed inventory will not be restored.</p>}</div>
  </AIActionCard>;
}
