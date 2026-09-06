import { LiveSearchResults } from "@/components/search/live-search-results";
import { Suspense } from "react";

export default function Page() {
  return <Suspense fallback={<main className="min-h-screen p-12 text-center text-slate-600">Loading search…</main>}><LiveSearchResults /></Suspense>;
}
