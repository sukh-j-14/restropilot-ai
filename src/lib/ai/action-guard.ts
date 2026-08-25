import { getAIActionRegistration } from "@/lib/ai/action-registry";
import { evaluateProposalLifecycle, type ProposalLifecycleStatus } from "@/lib/ai/action-lifecycle";
import { isAuthorizedForAction } from "@/lib/ai/action-policy";

export function guardAIAction(input: { type: unknown; proposalRestaurantId: string; trustedRestaurantId: string; orgRole: string | null | undefined; status: ProposalLifecycleStatus; expiresAt: Date; now: Date; resultResourceId?: string | null }) {
  if (input.proposalRestaurantId !== input.trustedRestaurantId) return { kind: "cross-tenant" as const };
  const registration = getAIActionRegistration(input.type);
  if (!registration) return { kind: "unregistered" as const };
  if (!isAuthorizedForAction(registration.policy, input.orgRole)) return { kind: "unauthorized" as const };
  return { registration, ...evaluateProposalLifecycle(input) };
}
