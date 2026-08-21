import {
  CatalogDeletionBlockedError,
  CatalogDuplicateError,
  CatalogNotFoundError,
} from "@/lib/services/catalog-errors";

export type CatalogActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
};

export function catalogErrorMessage(error: unknown) {
  if (
    error instanceof CatalogDuplicateError ||
    error instanceof CatalogDeletionBlockedError ||
    error instanceof CatalogNotFoundError
  ) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}
