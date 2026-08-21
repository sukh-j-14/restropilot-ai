export class ImportEngineError extends Error {
  constructor(message: string) { super(message); this.name = "ImportEngineError"; }
}
