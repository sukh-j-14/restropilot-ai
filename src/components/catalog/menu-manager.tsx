"use client";

import { useActionState } from "react";
import { ActionFeedback, FieldMessage } from "@/components/catalog/action-feedback";
import type { CatalogActionState } from "@/lib/catalog/action-utils";
import {
  createMenuItemAction,
  deleteMenuItemAction,
  toggleMenuItemAction,
  updateMenuItemAction,
} from "@/lib/menu/actions";
import { RecipeEditor, type IngredientOption, type RecipeView } from "@/components/catalog/recipe-editor";

type MenuItemView = {
  id: string;
  name: string;
  category: string;
  price: number;
  isActive: boolean;
};

const initialState: CatalogActionState = { status: "idle" };
const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/10";

function Price({ value, currency }: { value: number; currency: string }) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

function MenuItemCard({ item, currency, ingredients, recipe }: { item: MenuItemView; currency: string; ingredients: IngredientOption[]; recipe: RecipeView[] }) {
  const [editState, editAction, editing] = useActionState(updateMenuItemAction, initialState);
  const [toggleState, toggleAction, toggling] = useActionState(toggleMenuItemAction, initialState);
  const [deleteState, deleteAction, deleting] = useActionState(deleteMenuItemAction, initialState);

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-slate-900">{item.name}</h2>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{item.isActive ? "Active" : "Inactive"}</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">{item.category}</p>
          <p className="mt-3 text-lg font-bold text-slate-900"><Price value={item.price} currency={currency} /></p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={toggleAction}>
            <input type="hidden" name="menuItemId" value={item.id} />
            <input type="hidden" name="isActive" value={String(!item.isActive)} />
            <button disabled={toggling} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">{item.isActive ? "Deactivate" : "Activate"}</button>
          </form>
          <form action={deleteAction} onSubmit={(event) => { if (!window.confirm(`Delete ${item.name}? This cannot be undone.`)) event.preventDefault(); }}>
            <input type="hidden" name="menuItemId" value={item.id} />
            <button disabled={deleting} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50">Delete</button>
          </form>
        </div>
      </div>
      <ActionFeedback state={toggleState} />
      <ActionFeedback state={deleteState} />
      <details className="mt-4 border-t border-slate-100 pt-4">
        <summary className="cursor-pointer text-xs font-bold text-emerald-700">Edit item</summary>
        <form action={editAction} className="mt-4 grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="menuItemId" value={item.id} />
          <div><label className="text-xs font-semibold text-slate-600">Name</label><input name="name" defaultValue={item.name} className={`${inputClass} mt-1`} /><FieldMessage message={editState.fieldErrors?.name} /></div>
          <div><label className="text-xs font-semibold text-slate-600">Category</label><input name="category" defaultValue={item.category} className={`${inputClass} mt-1`} /><FieldMessage message={editState.fieldErrors?.category} /></div>
          <div><label className="text-xs font-semibold text-slate-600">Price</label><input name="price" type="number" min="0.01" step="0.01" defaultValue={item.price} className={`${inputClass} mt-1`} /><FieldMessage message={editState.fieldErrors?.price} /></div>
          <div className="sm:col-span-3"><button disabled={editing} className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{editing ? "Saving…" : "Save changes"}</button><ActionFeedback state={editState} /></div>
        </form>
      </details>
      <RecipeEditor menuItemId={item.id} ingredients={ingredients} recipe={recipe} />
    </article>
  );
}

export function MenuManager({ items, currency, ingredients, recipes }: { items: MenuItemView[]; currency: string; ingredients: IngredientOption[]; recipes: RecipeView[] }) {
  const [state, action, pending] = useActionState(createMenuItemAction, initialState);
  return (
    <>
      <details className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <summary className="cursor-pointer text-sm font-bold text-emerald-700">Add menu item</summary>
        <form action={action} className="mt-5 grid gap-4 sm:grid-cols-3">
          <div><label className="text-xs font-semibold text-slate-600">Name</label><input name="name" required className={`${inputClass} mt-1`} /><FieldMessage message={state.fieldErrors?.name} /></div>
          <div><label className="text-xs font-semibold text-slate-600">Category</label><input name="category" required placeholder="Main Course" className={`${inputClass} mt-1`} /><FieldMessage message={state.fieldErrors?.category} /></div>
          <div><label className="text-xs font-semibold text-slate-600">Price</label><input name="price" required type="number" min="0.01" step="0.01" className={`${inputClass} mt-1`} /><FieldMessage message={state.fieldErrors?.price} /></div>
          <div className="sm:col-span-3"><button disabled={pending} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{pending ? "Adding…" : "Add menu item"}</button><ActionFeedback state={state} /></div>
        </form>
      </details>
      {items.length ? <div className="mt-5 grid gap-4 xl:grid-cols-2">{items.map((item) => <MenuItemCard key={item.id} item={item} currency={currency} ingredients={ingredients} recipe={recipes.filter((recipe) => recipe.menuItemId === item.id)} />)}</div> : <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center"><h2 className="font-semibold text-slate-800">No menu items yet</h2><p className="mt-1 text-sm text-slate-500">Add your first item to start building the restaurant menu.</p></div>}
    </>
  );
}
