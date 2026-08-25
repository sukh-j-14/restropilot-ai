"use client";
import { useState, useTransition } from "react";
import { AIActionCard } from "@/components/ai/ai-action-card";
import { ConfirmButton } from "@/components/ui/confirm-action";
import type { MenuRecipeAIActionProposal } from "@/lib/ai/action-proposal-types";
import type { ProposalLifecycleStatus } from "@/lib/ai/action-lifecycle";
import { approveAIActionProposalAction, rejectAIActionProposalAction, type ProposalActionResult } from "@/lib/ai/proposal-actions";

export function MenuRecipeProposalCard({ proposal, currency }: { proposal: MenuRecipeAIActionProposal; currency: string }) {
  const [status, setStatus] = useState<ProposalLifecycleStatus>(proposal.status); const [result, setResult] = useState<ProposalActionResult | null>(null); const [pending, startTransition] = useTransition();
  const act = (operation: "approve" | "reject") => startTransition(async () => { const value = operation === "approve" ? await approveAIActionProposalAction({ proposalId: proposal.proposalId }) : await rejectAIActionProposalAction(proposal.proposalId); setResult(value); if (value.success) setStatus(value.status); });
  const format = (label: string, value?: string) => label === "Price" && value !== undefined ? `${currency} ${Number(value).toFixed(2)}` : value;
  return <AIActionCard proposal={proposal} status={status} result={result} actions={<><button type="button" disabled={pending} onClick={() => act("approve")} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{pending ? "Working…" : "Approve change"}</button><ConfirmButton pending={pending} label="Reject" confirmLabel="Reject proposal" message="Reject this proposed menu change?" onConfirm={() => act("reject")} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold" /></>}>
    <div className="mt-4 rounded-xl bg-slate-50 p-3"><p className="font-semibold text-slate-900">{proposal.display.menuItemName}</p>{proposal.display.ingredientName && <p className="text-sm text-slate-500">{proposal.display.ingredientName}{proposal.display.unit ? ` (${proposal.display.unit})` : ""}</p>}<dl className="mt-3 space-y-2">{proposal.display.changes.map((change) => <div key={change.label} className="grid grid-cols-[110px_1fr] gap-3 text-sm"><dt className="text-slate-500">{change.label}</dt><dd className="font-medium">{change.current !== undefined && <span className="text-slate-500 line-through">{format(change.label, change.current)}</span>}{change.current !== undefined && change.proposed !== undefined ? " → " : ""}<span>{format(change.label, change.proposed)}</span></dd></div>)}</dl></div>
  </AIActionCard>;
}
