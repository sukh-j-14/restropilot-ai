"use client";

import { useActionState } from "react";
import { ActionFeedback, FieldMessage } from "@/components/catalog/action-feedback";
import type { CatalogActionState } from "@/lib/catalog/action-utils";
import { INGREDIENT_UNITS } from "@/lib/catalog/validation";
import {
  createIngredientAction,
  deleteIngredientAction,
  updateIngredientAction,
} from "@/lib/inventory/actions";

type IngredientView = {
  ingredientId: string;
  name: string;
  unit: string;
  currentStock: number;
  reorderLevel: number;
  costPerUnit: number;
  isLowStock: boolean;
};

const initialState: CatalogActionState = { status: "idle" };
const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/10";

function IngredientFields({ item, errors }: { item?: IngredientView; errors?: Record<string, string> }) {
  return (
    <>
      <div><label className="text-xs font-semibold text-slate-600">Name</label><input name="name" required defaultValue={item?.name} className={`${inputClass} mt-1`} /><FieldMessage message={errors?.name} /></div>
      <div><label className="text-xs font-semibold text-slate-600">Unit</label><select name="unit" defaultValue={item?.unit ?? "kg"} className={`${inputClass} mt-1`}>{INGREDIENT_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select><FieldMessage message={errors?.unit} /></div>
      <div><label className="text-xs font-semibold text-slate-600">Current stock</label><input name="currentStock" required type="number" min="0" step="0.001" defaultValue={item?.currentStock ?? 0} className={`${inputClass} mt-1`} /><FieldMessage message={errors?.currentStock} /></div>
      <div><label className="text-xs font-semibold text-slate-600">Reorder level</label><input name="reorderLevel" required type="number" min="0" step="0.001" defaultValue={item?.reorderLevel ?? 0} className={`${inputClass} mt-1`} /><FieldMessage message={errors?.reorderLevel} /></div>
      <div><label className="text-xs font-semibold text-slate-600">Cost per unit</label><input name="costPerUnit" required type="number" min="0" step="0.0001" defaultValue={item?.costPerUnit ?? 0} className={`${inputClass} mt-1`} /><FieldMessage message={errors?.costPerUnit} /></div>
    </>
  );
}

function IngredientCard({ item, currency }: { item: IngredientView; currency: string }) {
  const [editState, editAction, editing] = useActionState(updateIngredientAction, initialState);
  const [deleteState, deleteAction, deleting] = useActionState(deleteIngredientAction, initialState);
  const money = new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 4 }).format(item.costPerUnit);
  return (
    <article className={`rounded-xl border bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] ${item.isLowStock ? "border-amber-300" : "border-slate-200"}`}>
      <div className="flex items-start justify-between gap-4">
        <div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-slate-900">{item.name}</h2><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.isLowStock ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{item.isLowStock ? "Low stock" : "Healthy"}</span></div><p className="mt-2 text-sm text-slate-600"><strong>{item.currentStock}</strong> {item.unit} available</p><p className="mt-1 text-xs text-slate-400">Reorder at {item.reorderLevel} {item.unit} · {money}/{item.unit}</p></div>
        <form action={deleteAction} onSubmit={(event) => { if (!window.confirm(`Delete ${item.name}? This cannot be undone.`)) event.preventDefault(); }}><input type="hidden" name="ingredientId" value={item.ingredientId} /><button disabled={deleting} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50">Delete</button></form>
      </div>
      <ActionFeedback state={deleteState} />
      <details className="mt-4 border-t border-slate-100 pt-4"><summary className="cursor-pointer text-xs font-bold text-emerald-700">Edit ingredient</summary><form action={editAction} className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><input type="hidden" name="ingredientId" value={item.ingredientId} /><IngredientFields item={item} errors={editState.fieldErrors} /><div className="sm:col-span-2 xl:col-span-5"><button disabled={editing} className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{editing ? "Saving…" : "Save changes"}</button><ActionFeedback state={editState} /></div></form></details>
    </article>
  );
}

export function InventoryManager({ items, currency }: { items: IngredientView[]; currency: string }) {
  const [state, action, pending] = useActionState(createIngredientAction, initialState);
  return (
    <>
      <details className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><summary className="cursor-pointer text-sm font-bold text-emerald-700">Add ingredient</summary><form action={action} className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><IngredientFields errors={state.fieldErrors} /><div className="sm:col-span-2 xl:col-span-5"><button disabled={pending} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{pending ? "Adding…" : "Add ingredient"}</button><ActionFeedback state={state} /></div></form></details>
      {items.length ? <div className="mt-5 grid gap-4 xl:grid-cols-2">{items.map((item) => <IngredientCard key={item.ingredientId} item={item} currency={currency} />)}</div> : <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center"><h2 className="font-semibold text-slate-800">No ingredients yet</h2><p className="mt-1 text-sm text-slate-500">Add ingredients to begin tracking restaurant inventory.</p></div>}
    </>
  );
}
