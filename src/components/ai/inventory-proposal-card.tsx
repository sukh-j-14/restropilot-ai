"use client";
import { useTransition } from "react";
import { AIActionCard } from "@/components/ai/ai-action-card";
import { useProposalState } from "@/components/ai/proposal-state-provider";
import { ConfirmButton } from "@/components/ui/confirm-action";
import type { InventoryAIActionProposal } from "@/lib/ai/action-proposal-types";
import { approveAIActionProposalAction, rejectAIActionProposalAction } from "@/lib/ai/proposal-actions";

export function InventoryProposalCard({ proposal, currency }: { proposal: InventoryAIActionProposal; currency: string }) {
  const { status, result, recordResult } = useProposalState(proposal); const [pending, startTransition] = useTransition();
  const act = (operation: "approve" | "reject") => startTransition(async () => recordResult(operation === "approve" ? await approveAIActionProposalAction({ proposalId: proposal.proposalId }) : await rejectAIActionProposalAction(proposal.proposalId)));
  const format = (label: string, value?: string) => label === "Unit cost" && value !== undefined ? `${currency} ${Number(value).toFixed(2)}` : value;
  const decreasing = proposal.display.changes.some((item) => item.tone === "decrease");
  return <AIActionCard proposal={proposal} status={status} result={result} actions={<><button type="button" disabled={pending} onClick={() => act("approve")} className={`rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${decreasing ? "bg-amber-700" : "bg-emerald-700"}`}>{pending ? "Working…" : "Approve adjustment"}</button><ConfirmButton pending={pending} label="Reject" confirmLabel="Reject proposal" message="Reject this proposed inventory change?" onConfirm={() => act("reject")} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold" /></>}>
    <div className={`mt-4 rounded-xl p-3 ${decreasing ? "border border-amber-200 bg-amber-50" : "bg-slate-50"}`}><p className="font-semibold text-slate-900">{proposal.display.ingredientName}</p><p className="text-sm text-slate-500">Base unit: {proposal.display.unit}</p><dl className="mt-3 space-y-2">{proposal.display.changes.map((item) => <div key={item.label} className="grid grid-cols-[120px_1fr] gap-3 text-sm"><dt className="text-slate-500">{item.label}</dt><dd className={item.tone === "decrease" ? "font-semibold text-amber-800" : "font-medium"}>{item.current !== undefined && <span className="text-slate-500">{format(item.label, item.current)}</span>}{item.current !== undefined && item.proposed !== undefined ? " → " : ""}{item.proposed !== undefined && <span>{format(item.label, item.proposed)}</span>}</dd></div>)}</dl></div>
  </AIActionCard>;
}
