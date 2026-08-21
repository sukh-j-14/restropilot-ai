import type { CatalogActionState } from "@/lib/catalog/action-utils";

export function ActionFeedback({ state }: { state: CatalogActionState }) {
  if (!state.message) return null;
  return (
    <p role={state.status === "error" ? "alert" : "status"} className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${state.status === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
      {state.message}
    </p>
  );
}

export function FieldMessage({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-xs font-medium text-rose-600">{message}</p> : null;
}
