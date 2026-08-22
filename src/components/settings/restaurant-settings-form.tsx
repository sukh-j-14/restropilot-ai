"use client";

import { useActionState } from "react";
import { updateRestaurantSettingsAction, type SettingsActionState } from "@/lib/settings/actions";
import { ONBOARDING_CURRENCIES, ONBOARDING_TIMEZONES, type OnboardingFields } from "@/lib/onboarding/validation";

type RestaurantValues = {
  name: string;
  phone: string | null;
  address: string | null;
  timezone: string;
  currency: string;
  guestCapacity: number | null;
};

const initialState: SettingsActionState = { status: "idle" };
const inputClass = "mt-2 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/10 disabled:bg-slate-50 disabled:text-slate-500";

function FieldError({ name, state }: { name: keyof OnboardingFields; state: SettingsActionState }) {
  const message = state.fieldErrors?.[name];
  return message ? <p id={`${name}-error`} className="mt-1.5 text-xs font-medium text-rose-600">{message}</p> : null;
}

export function RestaurantSettingsForm({ restaurant, canEdit }: { restaurant: RestaurantValues; canEdit: boolean }) {
  const [state, formAction, pending] = useActionState(updateRestaurantSettingsAction, initialState);
  return <form action={formAction} className="space-y-6" noValidate>
    {state.message && <div role={state.status === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${state.status === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{state.message}</div>}
    {!canEdit && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">You can view these settings, but only an organization administrator can change them.</div>}

    <fieldset disabled={!canEdit || pending} className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="text-base font-semibold text-slate-900">Restaurant profile</h2><p className="mt-1 text-sm text-slate-500">The identity and contact information shown across your workspace.</p><div className="mt-5 space-y-5"><div><label htmlFor="name" className="text-sm font-semibold text-slate-700">Restaurant name</label><input id="name" name="name" defaultValue={restaurant.name} required maxLength={120} autoComplete="organization" className={inputClass} aria-describedby={state.fieldErrors?.name ? "name-error" : undefined} /><FieldError name="name" state={state} /></div><div className="grid gap-5 sm:grid-cols-2"><div><label htmlFor="phone" className="text-sm font-semibold text-slate-700">Phone <span className="font-normal text-slate-400">(optional)</span></label><input id="phone" name="phone" type="tel" defaultValue={restaurant.phone ?? ""} maxLength={24} autoComplete="tel" className={inputClass} aria-describedby={state.fieldErrors?.phone ? "phone-error" : undefined} /><FieldError name="phone" state={state} /></div><div><label htmlFor="guestCapacity" className="text-sm font-semibold text-slate-700">Operational guest capacity</label><input id="guestCapacity" name="guestCapacity" type="number" min={1} max={2000} step={1} defaultValue={restaurant.guestCapacity ?? 96} required className={inputClass} aria-describedby={state.fieldErrors?.guestCapacity ? "guestCapacity-error" : undefined} /><FieldError name="guestCapacity" state={state} /></div></div><div><label htmlFor="address" className="text-sm font-semibold text-slate-700">Address <span className="font-normal text-slate-400">(optional)</span></label><textarea id="address" name="address" rows={3} defaultValue={restaurant.address ?? ""} maxLength={300} autoComplete="street-address" className={`${inputClass} resize-none`} aria-describedby={state.fieldErrors?.address ? "address-error" : undefined} /><FieldError name="address" state={state} /></div></div></section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="text-base font-semibold text-slate-900">Regional operations</h2><p className="mt-1 text-sm text-slate-500">Timezone controls reporting boundaries and reservation times. Currency controls monetary displays.</p><div className="mt-5 grid gap-5 sm:grid-cols-2"><div><label htmlFor="timezone" className="text-sm font-semibold text-slate-700">Timezone</label><select id="timezone" name="timezone" defaultValue={restaurant.timezone} className={inputClass} aria-describedby={state.fieldErrors?.timezone ? "timezone-error" : undefined}>{ONBOARDING_TIMEZONES.map((value) => <option key={value} value={value}>{value}</option>)}</select><FieldError name="timezone" state={state} /></div><div><label htmlFor="currency" className="text-sm font-semibold text-slate-700">Currency</label><select id="currency" name="currency" defaultValue={restaurant.currency} className={inputClass} aria-describedby={state.fieldErrors?.currency ? "currency-error" : undefined}>{ONBOARDING_CURRENCIES.map((value) => <option key={value} value={value}>{value}</option>)}</select><FieldError name="currency" state={state} /></div></div></section>
    </fieldset>
    {canEdit && <div className="flex justify-end"><button type="submit" disabled={pending} className="rounded-lg bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60">{pending ? "Saving changes…" : "Save changes"}</button></div>}
  </form>;
}
