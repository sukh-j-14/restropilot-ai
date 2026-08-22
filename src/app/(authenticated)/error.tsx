"use client";

export default function AuthenticatedError({ reset }: { reset: () => void }) {
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
    <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm" role="alert">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-700" aria-hidden>!</div>
      <h1 className="mt-4 text-xl font-bold text-slate-950">This workspace could not be loaded</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">Your data was not changed. Retry the request, or refresh after checking your connection.</p>
      <button type="button" onClick={reset} className="mt-5 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800">Try again</button>
    </section>
  </main>;
}
