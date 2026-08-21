export class PurchaseOrderError extends Error {
  constructor(message: string) { super(message); this.name = "PurchaseOrderError"; }
}
