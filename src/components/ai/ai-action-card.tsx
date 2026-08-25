"use client";
import type { ReactNode } from "react";
import type { AIActionProposal } from "@/lib/ai/action-proposal-types";
import type { ProposalLifecycleStatus } from "@/lib/ai/action-lifecycle";

export function AIActionCard({ proposal, status, result, children, actions }: { proposal: AIActionProposal; status: ProposalLifecycleStatus; result?: { success: boolean; message: string; detail?: ReactNode } | null; children: ReactNode; actions?: ReactNode }) {
  const terminal = ["EXECUTED", "REJECTED", "EXPIRED", "FAILED"].includes(status);
  return <section className="mt-3 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm" aria-label={`${proposal.title} action proposal`}>
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Proposed action / {proposal.riskLevel.toLowerCase()} risk{proposal.approvalRequired ? " / approval required" : ""}</p><h3 className="mt-1 font-bold text-slate-900">{proposal.title}</h3></div><span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800">{status.replaceAll("_", " ")}</span></div>
    <p className="mt-2 text-sm leading-6 text-slate-600">{proposal.explanation}</p>
    {children}
    {result && <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-sm ${result.success ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{result.message}{result.detail}</p>}
    {!terminal && actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
  </section>;
}
