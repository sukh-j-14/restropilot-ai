"use client";

import { useActionState } from "react";
import { ActionFeedback, FieldMessage } from "@/components/catalog/action-feedback";
import type { CatalogActionState } from "@/lib/catalog/action-utils";
import { addRecipeItemAction, removeRecipeItemAction, updateRecipeItemAction } from "@/lib/recipes/actions";

export type RecipeView = { id: string; menuItemId: string; ingredientId: string; ingredientName: string; unit: string; quantityRequired: number };
export type IngredientOption = { id: string; name: string; unit: string };
const initialState: CatalogActionState = { status: "idle" };
const fieldClass = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/10";

function RecipeRow({ item }: { item: RecipeView }) {
  const [editState, editAction, editing] = useActionState(updateRecipeItemAction, initialState);
  const [removeState, removeAction, removing] = useActionState(removeRecipeItemAction, initialState);
  return <li className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
    <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-slate-800">{item.ingredientName}</p><p className="text-xs text-slate-500">Measured in {item.unit}</p></div>
      <form action={removeAction} onSubmit={(event) => { if (!window.confirm(`Remove ${item.ingredientName} from this recipe?`)) event.preventDefault(); }}><input type="hidden" name="recipeItemId" value={item.id} /><button disabled={removing} className="text-xs font-semibold text-rose-600 disabled:opacity-50">Remove</button></form></div>
    <form action={editAction} className="mt-3 flex flex-wrap items-start gap-2"><input type="hidden" name="recipeItemId" value={item.id} /><div><input aria-label={`Quantity of ${item.ingredientName}`} name="quantityRequired" type="number" min="0.001" step="0.001" defaultValue={item.quantityRequired} className={`${fieldClass} w-32`} /><FieldMessage message={editState.fieldErrors?.quantityRequired} /></div><span className="py-2 text-sm text-slate-500">{item.unit}</span><button disabled={editing} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Save</button></form>
    <ActionFeedback state={editState} /><ActionFeedback state={removeState} />
  </li>;
}

export function RecipeEditor({ menuItemId, ingredients, recipe }: { menuItemId: string; ingredients: IngredientOption[]; recipe: RecipeView[] }) {
  const [state, action, pending] = useActionState(addRecipeItemAction, initialState);
  const available = ingredients.filter((ingredient) => !recipe.some((item) => item.ingredientId === ingredient.id));
  return <section className="mt-5 border-t border-slate-100 pt-4" aria-labelledby={`recipe-${menuItemId}`}>
    <h3 id={`recipe-${menuItemId}`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Recipe</h3>
    {recipe.length ? <ul className="mt-3 space-y-2">{recipe.map((item) => <RecipeRow key={item.id} item={item} />)}</ul> : <div className="mt-3 rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">No recipe defined yet.</div>}
    {ingredients.length ? <form action={action} className="mt-3 grid gap-2 sm:grid-cols-[1fr_130px_auto] sm:items-start"><input type="hidden" name="menuItemId" value={menuItemId} /><select name="ingredientId" required disabled={!available.length} className={fieldClass} defaultValue=""><option value="" disabled>{available.length ? "Select ingredient" : "All ingredients added"}</option>{available.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} ({ingredient.unit})</option>)}</select><div><input aria-label="Quantity required" name="quantityRequired" required type="number" min="0.001" step="0.001" placeholder="Quantity" className={`${fieldClass} w-full`} /><FieldMessage message={state.fieldErrors?.quantityRequired} /></div><button disabled={pending || !available.length} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50">Add</button><div className="sm:col-span-3"><ActionFeedback state={state} /></div></form> : <p className="mt-3 text-xs text-slate-500">Add ingredients in Inventory before creating a recipe.</p>}
  </section>;
}
