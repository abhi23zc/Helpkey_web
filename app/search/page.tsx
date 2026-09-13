import { LiveSearchResults } from "@/components/search/live-search-results";
import { Suspense } from "react";

export default function Page() {
  return <Suspense fallback={<main className="min-h-screen bg-[var(--hk-ivory)] p-8" aria-label="Loading search"><div className="mx-auto max-w-[1280px] animate-pulse space-y-6"><div className="h-16 rounded-2xl bg-slate-200" /><div className="grid gap-8 lg:grid-cols-[280px_1fr]"><div className="hidden h-[540px] rounded-2xl bg-slate-200 lg:block" /><div className="space-y-4"><div className="h-16 w-72 rounded bg-slate-200" /><div className="h-56 rounded-2xl bg-slate-200" /><div className="h-56 rounded-2xl bg-slate-200" /></div></div></div></main>}><LiveSearchResults /></Suspense>;
}
