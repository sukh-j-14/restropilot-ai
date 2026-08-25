export type ProposalLifecycleStatus = "PENDING" | "APPROVED" | "EXECUTED" | "REJECTED" | "EXPIRED" | "FAILED";

export function evaluateProposalLifecycle(input: { status: ProposalLifecycleStatus; expiresAt: Date; now: Date; resultResourceId?: string | null }) {
  if (input.status === "EXECUTED" && input.resultResourceId) return { kind: "already-executed" as const, resultResourceId: input.resultResourceId };
  if (input.status !== "PENDING") return { kind: "unavailable" as const, status: input.status };
  if (input.expiresAt <= input.now) return { kind: "expired" as const };
  return { kind: "ready" as const };
}

