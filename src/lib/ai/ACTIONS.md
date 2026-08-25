# AI operations actions

AI actions are proposals, not provider mutation tools. The browser sends only a proposal identifier and action-specific review edits. The server resolves Clerk organization and Restaurant context, loads the proposal within that tenant, selects an allowlisted registration, reauthorizes the actor, checks lifecycle and current business state, and invokes an existing deterministic service.

To add an action type later:

1. Add its literal to `AIActionType` and a discriminated payload/display member to `AIActionProposal`.
2. Define its server-owned risk, approval, authorization, and expiry policy in `action-policy.ts`.
3. Add one explicit registration in `action-registry.ts`, including fixed validator, stale-check, handler, and renderer keys.
4. Add a strict provider-neutral proposal schema and candidate validator. Expose only that proposal tool—not an execution tool—to the provider.
5. Prepare and persist only validated canonical proposal data. Never persist provider transcripts or reasoning.
6. Add a deterministic handler that revalidates tenant ownership and current business state, then calls the existing service layer transactionally.
7. Add an action-specific review renderer to the explicit client renderer switch. Never render model HTML or select components dynamically from model output.
8. Add approval, rejection, cross-tenant, expiry, stale-state, authorization, idempotency, and regression tests before registering the action.

Only `CREATE_PURCHASE_ORDER_DRAFT` is registered today. Adding a type to documentation or a TypeScript union alone does not make it executable.
