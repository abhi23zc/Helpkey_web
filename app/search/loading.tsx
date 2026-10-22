export default function SearchLoading() {
  return (
    <main className="min-h-screen bg-[var(--hk-ivory)] px-4 py-8 sm:px-6 lg:px-10" aria-label="Loading search results" aria-busy="true">
      <div className="mx-auto max-w-[1280px] space-y-6">
        <div role="status" className="flex items-center gap-3 text-sm font-semibold text-slate-600">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-[var(--hk-navy-strong)]" aria-hidden="true" />
          Finding the best stays for you…
        </div>
        <div className="animate-pulse space-y-6">
          <div className="h-16 rounded-2xl bg-slate-200" />
          <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
            <div className="hidden h-[540px] rounded-2xl bg-slate-200 lg:block" />
            <div className="space-y-4">
              <div className="h-8 w-72 rounded bg-slate-200" />
              {[0, 1, 2].map((i) => (
                <div key={i} className="grid gap-4 rounded-2xl bg-white p-3 shadow-sm sm:grid-cols-[260px_1fr]">
                  <div className="h-44 rounded-xl bg-slate-200" />
                  <div className="space-y-3 py-2">
                    <div className="h-6 w-2/3 rounded bg-slate-200" />
                    <div className="h-4 w-1/3 rounded bg-slate-200" />
                    <div className="h-4 w-1/2 rounded bg-slate-200" />
                    <div className="h-10 w-32 rounded-xl bg-slate-200" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
