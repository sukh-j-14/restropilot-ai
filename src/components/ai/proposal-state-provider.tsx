"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AIActionProposal } from "@/lib/ai/action-proposal-types";
import { mergeProposalStatus, type ProposalLifecycleStatus } from "@/lib/ai/action-lifecycle";
import { getAIActionProposalStatesAction, type ProposalActionResult } from "@/lib/ai/proposal-actions";

type ProposalPresentationState = { status: ProposalLifecycleStatus; result: ProposalActionResult | null };
type ProposalStateContextValue = {
  states: Record<string, ProposalPresentationState>;
  recordResult: (proposalId: string, result: ProposalActionResult) => void;
};

const ProposalStateContext = createContext<ProposalStateContextValue | null>(null);
const proposalStateCache: Record<string, ProposalPresentationState> = {};

export function ProposalStateProvider({ proposals, children }: { proposals: AIActionProposal[]; children: ReactNode }) {
  const [states, setStates] = useState<Record<string, ProposalPresentationState>>(() => ({ ...proposalStateCache }));

  useEffect(() => {
    const ids = [...new Set(proposals.map((proposal) => proposal.proposalId))];
    if (!ids.length) return;
    let cancelled = false;
    void getAIActionProposalStatesAction(ids).then((result) => {
      if (cancelled || !result.success) return;
      setStates((current) => {
        const next = { ...current };
        for (const item of result.proposals) {
          const prior = next[item.proposalId];
          next[item.proposalId] = { status: mergeProposalStatus(prior?.status, item.status), result: prior?.result ?? null };
          proposalStateCache[item.proposalId] = next[item.proposalId];
        }
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [proposals]);

  const recordResult = useCallback((proposalId: string, result: ProposalActionResult) => {
    setStates((current) => {
      const prior = current[proposalId];
      const incoming = result.status ?? prior?.status ?? "PENDING";
      const updated = { status: mergeProposalStatus(prior?.status, incoming), result };
      proposalStateCache[proposalId] = updated;
      return { ...current, [proposalId]: updated };
    });
  }, []);
  const value = useMemo(() => ({ states, recordResult }), [states, recordResult]);
  return <ProposalStateContext.Provider value={value}>{children}</ProposalStateContext.Provider>;
}

export function useProposalState(proposal: AIActionProposal) {
  const context = useContext(ProposalStateContext);
  if (!context) throw new Error("AI proposal cards must be rendered inside ProposalStateProvider.");
  const state = context.states[proposal.proposalId] ?? { status: proposal.status, result: null };
  return { ...state, recordResult: (result: ProposalActionResult) => context.recordResult(proposal.proposalId, result) };
}
