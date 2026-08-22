export default function SalesLoading() {
  return <main className="mx-auto max-w-[1480px] animate-pulse px-4 py-10 sm:px-6 lg:px-8"><div className="h-7 w-40 rounded bg-slate-200" /><div className="mt-7 h-28 rounded-2xl bg-slate-200" /><div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 rounded-2xl bg-slate-200" />)}</div><div className="mt-6 h-80 rounded-2xl bg-slate-200" /></main>;
}
