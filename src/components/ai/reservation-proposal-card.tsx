"use client";

import { useTransition } from "react";
import { AIActionCard } from "@/components/ai/ai-action-card";
import { useProposalState } from "@/components/ai/proposal-state-provider";
import { ConfirmButton } from "@/components/ui/confirm-action";
import type { ReservationAIActionProposal } from "@/lib/ai/action-proposal-types";
import { approveAIActionProposalAction, rejectAIActionProposalAction } from "@/lib/ai/proposal-actions";

export function ReservationProposalCard({ proposal }: { proposal: ReservationAIActionProposal }) {
  const { status, result, recordResult } = useProposalState(proposal);
  const [pending, startTransition] = useTransition();
  const destructive = proposal.type === "TRANSITION_RESERVATION_STATUS" && ["CANCELLED", "NO_SHOW"].includes(proposal.display.status ?? "");
  const act = (operation: "approve" | "reject") => startTransition(async () => {
    const value = operation === "approve" ? await approveAIActionProposalAction({ proposalId: proposal.proposalId }) : await rejectAIActionProposalAction(proposal.proposalId);
    recordResult(value);
  });
  const approveLabel = proposal.type === "CREATE_RESERVATION" ? "Approve & create" : proposal.type === "UPDATE_RESERVATION" ? "Approve change" : "Approve status";
  return <AIActionCard proposal={proposal} status={status} result={result} actions={<><button type="button" disabled={pending} onClick={() => act("approve")} className={`rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${destructive ? "bg-rose-700" : "bg-emerald-700"}`}>{pending ? "Working…" : approveLabel}</button><ConfirmButton pending={pending} label="Reject" confirmLabel="Reject proposal" message="Reject this proposed reservation change?" onConfirm={() => act("reject")} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold" /></>}>
    <div className={`mt-4 rounded-xl p-3 ${destructive ? "bg-rose-50" : "bg-slate-50"}`}><p className="font-semibold text-slate-900">{proposal.display.customerName}</p><p className="mt-1 text-sm text-slate-600">{proposal.display.localDateTime.replace("T", " · ")} · {proposal.display.guestCount} guests · {proposal.display.tableNumber ? `Table ${proposal.display.tableNumber}` : "Table not assigned"}</p><dl className="mt-3 space-y-2">{proposal.display.changes.map((item) => <div key={item.label} className="grid gap-1 text-sm sm:grid-cols-[100px_1fr] sm:gap-3"><dt className="text-slate-500">{item.label}</dt><dd className="font-medium text-slate-800">{item.current !== undefined && <span className="text-slate-500">{item.current}</span>}{item.current !== undefined && item.proposed !== undefined ? " → " : ""}{item.proposed !== undefined && <span>{item.proposed}</span>}</dd></div>)}</dl></div>
  </AIActionCard>;
}
