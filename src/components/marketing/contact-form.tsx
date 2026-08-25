"use client";
import { useActionState, useEffect, useRef } from "react";
import { submitContactAction, type ContactActionState } from "@/lib/contact/actions";

const initialState: ContactActionState = { status: "idle" };
const inputClass = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 disabled:opacity-60";

export function ContactForm() {
  const [state, action, pending] = useActionState(submitContactAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.status === "success") formRef.current?.reset(); }, [state.status]);
  const error = (name: keyof NonNullable<ContactActionState["fieldErrors"]>) => state.fieldErrors?.[name];
  return <form ref={formRef} action={action} className="relative rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_20px_70px_rgba(15,23,42,0.08)] sm:p-7" noValidate>
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Full name" name="fullName" required error={error("fullName")}><input id="contact-fullName" name="fullName" required maxLength={100} autoComplete="name" className={inputClass} aria-invalid={Boolean(error("fullName"))} aria-describedby={error("fullName") ? "contact-fullName-error" : undefined} /></Field>
      <Field label="Restaurant / business name" name="businessName" required error={error("businessName")}><input id="contact-businessName" name="businessName" required maxLength={120} autoComplete="organization" className={inputClass} aria-invalid={Boolean(error("businessName"))} aria-describedby={error("businessName") ? "contact-businessName-error" : undefined} /></Field>
      <Field label="Work email" name="email" required error={error("email")}><input id="contact-email" name="email" type="email" required maxLength={254} autoComplete="email" className={inputClass} aria-invalid={Boolean(error("email"))} aria-describedby={error("email") ? "contact-email-error" : undefined} /></Field>
      <Field label="Phone number" hint="optional" name="phone" error={error("phone")}><input id="contact-phone" name="phone" type="tel" maxLength={30} autoComplete="tel" className={inputClass} aria-invalid={Boolean(error("phone"))} aria-describedby={error("phone") ? "contact-phone-error" : undefined} /></Field>
      <Field label="Enquiry type" name="enquiryType" required error={error("enquiryType")} className="sm:col-span-2"><select id="contact-enquiryType" name="enquiryType" defaultValue="demo" required className={inputClass} aria-invalid={Boolean(error("enquiryType"))} aria-describedby={error("enquiryType") ? "contact-enquiryType-error" : undefined}><option value="demo">Request a demo</option><option value="pricing">Pricing question</option><option value="product">Product question</option><option value="partnership">Partnership / other</option></select></Field>
      <Field label="Message" name="message" required error={error("message")} className="sm:col-span-2"><textarea id="contact-message" name="message" required maxLength={2000} rows={5} className={`${inputClass} resize-y`} placeholder="Tell us a little about your restaurant and what you’d like to explore." aria-invalid={Boolean(error("message"))} aria-describedby={error("message") ? "contact-message-error" : undefined} /></Field>
    </div>
    <div className="absolute -left-[10000px] h-px w-px overflow-hidden" aria-hidden="true"><label htmlFor="contact-website">Website</label><input id="contact-website" name="website" tabIndex={-1} autoComplete="off" /></div>
    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-slate-500">Your details are used only to respond to this enquiry.</p><button type="submit" disabled={pending || state.status === "success"} className="rounded-xl bg-emerald-700 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60">{pending ? "Sending…" : state.status === "success" ? "Request sent" : "Request a demo"}</button></div>
    {state.message && <div role={state.status === "error" ? "alert" : "status"} aria-live="polite" className={`mt-5 rounded-xl border px-4 py-3 text-sm font-semibold ${state.status === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{state.message}</div>}
  </form>;
}

function Field({ label, hint, name, required, error, className = "", children }: { label: string; hint?: string; name: string; required?: boolean; error?: string; className?: string; children: React.ReactNode }) {
  const errorId = `contact-${name}-error`;
  return <div className={className}><label htmlFor={`contact-${name}`} className="text-sm font-semibold text-slate-700">{label}{hint && <span className="ml-1 font-normal text-slate-400"> ({hint})</span>}{required && <span className="sr-only"> (required)</span>}</label><div>{children}</div>{error && <p id={errorId} className="mt-1.5 text-xs font-semibold text-rose-600">{error}</p>}</div>;
}
