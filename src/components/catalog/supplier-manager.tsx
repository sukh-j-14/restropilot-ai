"use client";

import { useActionState } from "react";
import { ConfirmSubmitButton } from "@/components/ui/confirm-action";
import { ActionFeedback, FieldMessage } from "@/components/catalog/action-feedback";
import type { CatalogActionState } from "@/lib/catalog/action-utils";
import { createSupplierAction, deleteSupplierAction, updateSupplierAction } from "@/lib/suppliers/actions";

type SupplierView = { id: string; name: string; email: string | null; phone: string | null };
const initialState: CatalogActionState = { status: "idle" };
const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/10";

function Fields({ supplier, errors }: { supplier?: SupplierView; errors?: Record<string, string> }) {
  return <><div><label className="text-xs font-semibold text-slate-600">Name</label><input name="name" required defaultValue={supplier?.name} className={`${inputClass} mt-1`} /><FieldMessage message={errors?.name} /></div><div><label className="text-xs font-semibold text-slate-600">Email <span className="font-normal text-slate-400">optional</span></label><input name="email" type="email" defaultValue={supplier?.email ?? ""} className={`${inputClass} mt-1`} /><FieldMessage message={errors?.email} /></div><div><label className="text-xs font-semibold text-slate-600">Phone <span className="font-normal text-slate-400">optional</span></label><input name="phone" type="tel" defaultValue={supplier?.phone ?? ""} className={`${inputClass} mt-1`} /><FieldMessage message={errors?.phone} /></div></>;
}

function SupplierCard({ supplier }: { supplier: SupplierView }) {
  const [editState, editAction, editing] = useActionState(updateSupplierAction, initialState);
  const [deleteState, deleteAction, deleting] = useActionState(deleteSupplierAction, initialState);
  return <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"><div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold text-slate-900">{supplier.name}</h2><p className="mt-1 text-sm text-slate-500">{supplier.email || "No email provided"}</p><p className="mt-0.5 text-sm text-slate-500">{supplier.phone || "No phone provided"}</p></div><form action={deleteAction}><input type="hidden" name="supplierId" value={supplier.id} /><ConfirmSubmitButton pending={deleting} label="Delete" confirmLabel="Delete supplier" message={`Delete ${supplier.name}? This cannot be undone.`} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50" /></form></div><ActionFeedback state={deleteState} /><details className="mt-4 border-t border-slate-100 pt-4"><summary className="cursor-pointer text-xs font-bold text-emerald-700">Edit supplier</summary><form action={editAction} className="mt-4 grid gap-3 sm:grid-cols-3"><input type="hidden" name="supplierId" value={supplier.id} /><Fields supplier={supplier} errors={editState.fieldErrors} /><div className="sm:col-span-3"><button disabled={editing} className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Save changes</button><ActionFeedback state={editState} /></div></form></details></article>;
}

export function SupplierManager({ suppliers }: { suppliers: SupplierView[] }) {
  const [state, action, pending] = useActionState(createSupplierAction, initialState);
  return <><details className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><summary className="cursor-pointer text-sm font-bold text-emerald-700">Add supplier</summary><form action={action} className="mt-5 grid gap-4 sm:grid-cols-3"><Fields errors={state.fieldErrors} /><div className="sm:col-span-3"><button disabled={pending} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{pending ? "Adding…" : "Add supplier"}</button><ActionFeedback state={state} /></div></form></details>{suppliers.length ? <div className="mt-5 grid gap-4 xl:grid-cols-2">{suppliers.map((supplier) => <SupplierCard key={supplier.id} supplier={supplier} />)}</div> : <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center"><h2 className="font-semibold text-slate-800">No suppliers yet</h2><p className="mt-1 text-sm text-slate-500">Add your first supplier to organize vendor contacts.</p></div>}</>;
}
