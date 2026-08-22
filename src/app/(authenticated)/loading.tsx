export default function AuthenticatedLoading() {
  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8" aria-label="Loading workspace" aria-busy="true">
    <div className="mx-auto max-w-6xl animate-pulse space-y-6">
      <div className="h-8 w-52 rounded-lg bg-slate-200" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 rounded-2xl border border-slate-200 bg-white" />)}</div>
      <div className="h-80 rounded-2xl border border-slate-200 bg-white" />
    </div>
  </main>;
}
