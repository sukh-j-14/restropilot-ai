export default function MenuLoading() {
  return <main className="min-h-screen bg-slate-50 p-8" aria-busy="true"><div className="h-7 w-48 animate-pulse rounded bg-slate-200" /><div className="mt-8 grid gap-4 sm:grid-cols-2">{[1, 2, 3, 4].map((item) => <div key={item} className="h-40 animate-pulse rounded-xl bg-slate-200/70" />)}</div></main>;
}
