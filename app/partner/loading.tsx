function Placeholder({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-slate-200/90 ${className}`} />;
}

function DashboardCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-200/90 bg-white/90 ${className}`}>{children}</section>;
}

/** A dashboard-shaped App Router fallback shared by every partner route. */
export default function PartnerLoading() {
  return (
    <main aria-busy="true" aria-live="polite" className="min-h-screen bg-[#f7f5f0] pl-0 font-sans text-[#061224] lg:pl-20 min-[1440px]:pl-[248px]">
      <span className="sr-only">Loading partner workspace</span>
      <aside aria-hidden="true" className="fixed inset-y-0 left-0 z-10 hidden w-20 border-r border-white/10 bg-[#041428] lg:flex lg:flex-col lg:items-center lg:py-5 min-[1440px]:w-[248px] min-[1440px]:items-stretch min-[1440px]:px-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0b2542] min-[1440px]:w-full min-[1440px]:justify-start min-[1440px]:px-3"><Placeholder className="h-5 w-5 rounded-md bg-[#d5a632]/40" /><Placeholder className="ml-3 hidden h-3 w-24 bg-white/15 min-[1440px]:block" /></div>
        <div className="mt-8 space-y-4 min-[1440px]:space-y-2">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="flex h-10 items-center justify-center rounded-xl min-[1440px]:justify-start min-[1440px]:gap-3 min-[1440px]:px-3"><Placeholder className={`h-4 w-4 ${index === 0 ? "bg-[#d5a632]/40" : "bg-white/15"}`} /><Placeholder className="hidden h-3 w-20 bg-white/15 min-[1440px]:block" /></div>)}</div>
        <div className="mt-auto flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 min-[1440px]:w-full min-[1440px]:justify-start min-[1440px]:px-3"><Placeholder className="h-5 w-5 rounded-full bg-white/15" /><Placeholder className="ml-3 hidden h-3 w-24 bg-white/15 min-[1440px]:block" /></div>
      </aside>
      <section className="mx-auto max-w-[1680px] space-y-4 px-3 py-4 sm:px-5 lg:px-6 2xl:px-8">
        <header className="grid gap-3 xl:grid-cols-[minmax(260px,320px)_minmax(220px,260px)_minmax(260px,1fr)_auto] xl:items-center">
          <DashboardCard className="flex h-12 items-center gap-3 px-3.5"><Placeholder className="h-7 w-8" /><Placeholder className="h-4 w-24" /><Placeholder className="ml-auto h-3 w-3 rounded-full" /></DashboardCard>
          <DashboardCard className="flex h-12 items-center gap-3 px-4"><Placeholder className="h-4 w-4" /><Placeholder className="h-4 w-24" /><Placeholder className="ml-auto h-4 w-4" /></DashboardCard>
          <DashboardCard className="hidden h-12 items-center gap-3 px-4 md:flex"><Placeholder className="h-4 w-4" /><Placeholder className="h-4 w-48 max-w-[60%]" /><Placeholder className="ml-auto h-5 w-8" /></DashboardCard>
          <div className="flex items-center justify-end gap-3"><Placeholder className="h-12 w-12 rounded-2xl" /><Placeholder className="h-11 w-11 rounded-full" /><div className="hidden space-y-1.5 sm:block"><Placeholder className="h-3 w-20" /><Placeholder className="h-2.5 w-14" /></div></div>
        </header>
        <DashboardCard className="p-5"><div className="flex flex-col gap-5 lg:flex-row lg:items-center"><Placeholder className="h-28 w-full shrink-0 rounded-xl lg:w-44" /><div className="min-w-0 flex-1 space-y-3"><Placeholder className="h-8 w-40" /><Placeholder className="h-4 w-72 max-w-full" /><div className="flex gap-3"><Placeholder className="h-7 w-24 rounded-full" /><Placeholder className="h-4 w-28 self-center" /></div></div><div className="flex gap-2"><Placeholder className="h-10 w-40 rounded-xl" /><Placeholder className="h-10 w-32 rounded-xl" /></div></div></DashboardCard>
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">{Array.from({ length: 5 }).map((_, index) => <DashboardCard key={index} className="flex min-h-[102px] items-center gap-3 p-5"><Placeholder className="h-10 w-10 rounded-full" /><div className="flex-1 space-y-2"><Placeholder className="h-3 w-20" /><Placeholder className="h-6 w-12" /><Placeholder className="h-2.5 w-24" /></div></DashboardCard>)}</div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_340px_340px]">
          <DashboardCard className="p-5"><div className="flex items-start justify-between"><div className="space-y-2"><Placeholder className="h-5 w-40" /><Placeholder className="h-3 w-64 max-w-full" /></div><Placeholder className="h-9 w-40" /></div><Placeholder className="mt-5 h-56 w-full rounded-xl" /><div className="mt-4 grid grid-cols-3 gap-4 border-t border-slate-100 pt-4">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="space-y-2"><Placeholder className="h-3 w-16" /><Placeholder className="h-5 w-20" /></div>)}</div></DashboardCard>
          <DashboardCard className="p-5"><Placeholder className="h-5 w-36" /><div className="mt-4 space-y-2">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="flex h-16 items-center gap-3 rounded-xl border border-slate-100 px-3"><Placeholder className="h-9 w-9 rounded-xl" /><div className="flex-1 space-y-2"><Placeholder className="h-3 w-24" /><Placeholder className="h-2.5 w-16" /></div></div>)}</div></DashboardCard>
          <DashboardCard className="p-5"><Placeholder className="h-5 w-28" /><Placeholder className="mt-4 h-24 w-full rounded-xl" /></DashboardCard>
        </div>
      </section>
    </main>
  );
}
