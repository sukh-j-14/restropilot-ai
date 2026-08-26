"use client";

import { useTransition } from "react";
import { AIActionCard } from "@/components/ai/ai-action-card";
import { useProposalState } from "@/components/ai/proposal-state-provider";
import { ConfirmButton } from "@/components/ui/confirm-action";
import type { RestaurantSettingsAIActionProposal } from "@/lib/ai/action-proposal-types";
import { approveAIActionProposalAction, rejectAIActionProposalAction } from "@/lib/ai/proposal-actions";

export function RestaurantSettingsProposalCard({ proposal }: { proposal: RestaurantSettingsAIActionProposal }) {
  const { status, result, recordResult } = useProposalState(proposal);
  const [pending, startTransition] = useTransition();
  const act = (operation: "approve" | "reject") => startTransition(async () => {
    const value = operation === "approve" ? await approveAIActionProposalAction({ proposalId: proposal.proposalId }) : await rejectAIActionProposalAction(proposal.proposalId);
    recordResult(value);
  });
  return <AIActionCard proposal={proposal} status={status} result={result} actions={<><button type="button" disabled={pending} onClick={() => act("approve")} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{pending ? "Working…" : "Approve change"}</button><ConfirmButton pending={pending} label="Reject" confirmLabel="Reject proposal" message="Reject this proposed settings change?" onConfirm={() => act("reject")} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold" /></>}>
    <div className="mt-4 rounded-xl bg-slate-50 p-3">
      <p className="font-semibold text-slate-900">{proposal.display.restaurantName}</p>
      <dl className="mt-3 space-y-2">{proposal.display.changes.map((item) => <div key={item.label} className="grid gap-1 text-sm sm:grid-cols-[130px_1fr] sm:gap-3"><dt className="text-slate-500">{item.label}</dt><dd className="font-medium text-slate-800"><span className="text-slate-500">{item.current}</span> → <span>{item.proposed}</span></dd></div>)}</dl>
      {proposal.display.timezoneChanged ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">This changes how restaurant-local dates and reporting periods are calculated.</p> : null}
    </div>
  </AIActionCard>;
}
