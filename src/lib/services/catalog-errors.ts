export class CatalogDuplicateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogDuplicateError";
  }
}

export class CatalogNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogNotFoundError";
  }
}

export class CatalogDeletionBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogDeletionBlockedError";
  }
}
