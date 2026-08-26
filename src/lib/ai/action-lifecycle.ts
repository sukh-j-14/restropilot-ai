export type ProposalLifecycleStatus = "PENDING" | "APPROVED" | "EXECUTED" | "REJECTED" | "EXPIRED" | "FAILED";

const terminalStatuses = new Set<ProposalLifecycleStatus>(["EXECUTED", "REJECTED", "EXPIRED", "FAILED"]);

export function isTerminalProposalStatus(status: ProposalLifecycleStatus) {
  return terminalStatuses.has(status);
}

/** Prevent stale assistant payloads from downgrading newer proposal lifecycle state. */
export function mergeProposalStatus(current: ProposalLifecycleStatus | undefined, incoming: ProposalLifecycleStatus) {
  if (!current) return incoming;
  if (isTerminalProposalStatus(current)) return current;
  if (isTerminalProposalStatus(incoming)) return incoming;
  if (current === "APPROVED" && incoming === "PENDING") return current;
  return incoming;
}

export function evaluateProposalLifecycle(input: { status: ProposalLifecycleStatus; expiresAt: Date; now: Date; resultResourceId?: string | null }) {
  if (input.status === "EXECUTED" && input.resultResourceId) return { kind: "already-executed" as const, resultResourceId: input.resultResourceId };
  if (input.status !== "PENDING") return { kind: "unavailable" as const, status: input.status };
  if (input.expiresAt <= input.now) return { kind: "expired" as const };
  return { kind: "ready" as const };
}
