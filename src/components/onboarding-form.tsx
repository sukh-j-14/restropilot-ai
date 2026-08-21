"use client";

import { useActionState } from "react";
import {
  createRestaurantAction,
  type OnboardingActionState,
} from "@/lib/onboarding/actions";
import {
  ONBOARDING_CURRENCIES,
  ONBOARDING_TIMEZONES,
  type OnboardingFields,
} from "@/lib/onboarding/validation";

function FieldError({ field, errors }: { field: keyof OnboardingFields; errors?: Partial<Record<keyof OnboardingFields, string>> }) {
  const message = errors?.[field];
  return message ? <p id={`${field}-error`} className="mt-1.5 text-xs font-medium text-rose-600">{message}</p> : null;
}

const inputClass = "mt-2 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/10";
const initialOnboardingState: OnboardingActionState = { status: "idle" };

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(createRestaurantAction, initialOnboardingState);

  return (
    <form action={formAction} className="mt-8 space-y-5" noValidate>
      {state.message ? (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.message}
        </div>
      ) : null}

      <div>
        <label htmlFor="name" className="text-sm font-semibold text-slate-700">Restaurant name</label>
        <input id="name" name="name" required maxLength={120} autoComplete="organization" className={inputClass} aria-describedby={state.fieldErrors?.name ? "name-error" : undefined} />
        <FieldError field="name" errors={state.fieldErrors} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="timezone" className="text-sm font-semibold text-slate-700">Timezone</label>
          <select id="timezone" name="timezone" defaultValue="Asia/Kolkata" className={inputClass} aria-describedby={state.fieldErrors?.timezone ? "timezone-error" : undefined}>
            {ONBOARDING_TIMEZONES.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}
          </select>
          <FieldError field="timezone" errors={state.fieldErrors} />
        </div>
        <div>
          <label htmlFor="currency" className="text-sm font-semibold text-slate-700">Currency</label>
          <select id="currency" name="currency" defaultValue="INR" className={inputClass} aria-describedby={state.fieldErrors?.currency ? "currency-error" : undefined}>
            {ONBOARDING_CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
          </select>
          <FieldError field="currency" errors={state.fieldErrors} />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="phone" className="text-sm font-semibold text-slate-700">Phone <span className="font-normal text-slate-400">(optional)</span></label>
          <input id="phone" name="phone" type="tel" maxLength={24} autoComplete="tel" className={inputClass} aria-describedby={state.fieldErrors?.phone ? "phone-error" : undefined} />
          <FieldError field="phone" errors={state.fieldErrors} />
        </div>
        <div>
          <label htmlFor="guestCapacity" className="text-sm font-semibold text-slate-700">Dinner guest capacity</label>
          <input id="guestCapacity" name="guestCapacity" type="number" min={1} max={2000} step={1} defaultValue={96} required className={inputClass} aria-describedby={state.fieldErrors?.guestCapacity ? "guestCapacity-error" : undefined} />
          <FieldError field="guestCapacity" errors={state.fieldErrors} />
        </div>
      </div>

      <div>
        <label htmlFor="address" className="text-sm font-semibold text-slate-700">Address <span className="font-normal text-slate-400">(optional)</span></label>
        <textarea id="address" name="address" rows={3} maxLength={300} autoComplete="street-address" className={`${inputClass} resize-none`} aria-describedby={state.fieldErrors?.address ? "address-error" : undefined} />
        <FieldError field="address" errors={state.fieldErrors} />
      </div>

      <button type="submit" disabled={pending} className="flex w-full items-center justify-center rounded-lg bg-emerald-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60">
        {pending ? "Creating restaurant…" : "Complete setup"}
      </button>
    </form>
  );
}
