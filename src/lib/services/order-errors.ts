export class OrderWorkflowError extends Error {
  constructor(message: string, public readonly code: "VALIDATION" | "ALREADY_CONSUMED" | "WRONG_STATUS" | "CONCURRENT_TRANSITION" | "STALE_CLIENT" = "VALIDATION") { super(message); this.name = "OrderWorkflowError"; }
}
